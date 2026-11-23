import { spawn, ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, basename, delimiter } from 'node:path'
import { formatTime } from '../shared/radix'
import { FORCE_TB } from './forceTb'

export type Std = '08' | '93c'
export type LogKind = 'cmd' | 'out' | 'err' | 'info' | 'ok' | 'warn'
export type LogFn = (kind: LogKind, text: string) => void

export interface Diagnostic {
  file: string
  line: number
  col: number
  severity: 'error' | 'warning' | 'note'
  message: string
}

const EXTRA_PATHS = ['/opt/homebrew/bin', '/usr/local/bin', join(homedir(), '.local/ghdl/bin'), '/usr/bin', '/bin']

/** Apps launched from Finder get a minimal PATH; extend it so ghdl and the linker are found. */
export function toolEnv(): NodeJS.ProcessEnv {
  const parts = (process.env.PATH ?? '').split(delimiter).filter(Boolean)
  for (const p of EXTRA_PATHS) if (!parts.includes(p)) parts.push(p)
  return { ...process.env, PATH: parts.join(delimiter) }
}

export function findGhdl(): string | null {
  if (process.env.GHDL && existsSync(process.env.GHDL)) return process.env.GHDL
  for (const dir of (toolEnv().PATH ?? '').split(delimiter)) {
    const p = join(dir, 'ghdl')
    if (existsSync(p)) return p
  }
  return null
}

export const GHDL_MISSING_HINT =
  'GHDL not found. Install the official arm64 build from https://github.com/ghdl/ghdl/releases ' +
  '(ghdl-llvm-*-macos*-aarch64.tar.gz) into ~/.local/ghdl, or set the GHDL environment variable.'

const DIAG_RE = /^(.+?\.vhdl?):(\d+):(\d+):\s*(error|warning|note)?:?\s*(.*)$/i

export function parseDiagnostics(output: string): Diagnostic[] {
  const out: Diagnostic[] = []
  for (const line of output.split(/\r?\n/)) {
    const m = line.match(DIAG_RE)
    if (!m) continue
    out.push({
      file: m[1],
      line: Number(m[2]),
      col: Number(m[3]),
      severity: ((m[4] ?? 'error').toLowerCase() as Diagnostic['severity']),
      message: m[5]
    })
  }
  return out
}

export interface Units {
  entities: { name: string; hasPorts: boolean; inputs: string[] }[]
  packages: string[]
  /** Entity/component names this file instantiates (lower case). */
  instantiates: string[]
}

/** Names of the `in`/`inout` ports of a port clause (mode omitted = in). */
function inputPorts(portClause: string): string[] {
  const out: string[] = []
  for (const decl of portClause.split(';')) {
    const m = decl.match(/([\w\s,]+?)\s*:(?!=)\s*(\w+)/)
    if (!m) continue
    if (/^(out|buffer|linkage)$/i.test(m[2])) continue
    out.push(...m[1].replace(/^[\s\S]*\bport\s*\(/i, '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean))
  }
  return out
}

/** Lightweight scan of design units (not a parser): good enough for ordering and testbench detection. */
export function scanUnits(src: string): Units {
  const code = src.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
  const entities: Units['entities'] = []
  const re = /\bentity\s+(\w+)\s+is\b([\s\S]*?)\bend\b/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(code))) {
    const p = m[2].search(/\bport\s*\(/i)
    entities.push({ name: m[1].toLowerCase(), hasPorts: p >= 0, inputs: p >= 0 ? inputPorts(m[2].slice(p)) : [] })
  }
  const packages = [...code.matchAll(/\bpackage\s+(?!body\b)(\w+)\s+is\b/gi)].map((x) => x[1].toLowerCase())
  const instantiates = [
    ...[...code.matchAll(/\bentity\s+\w+\.(\w+)/gi)].map((x) => x[1]),
    ...[...code.matchAll(/\b\w+\s*:\s*(?:component\s+)?(\w+)\s+(?:generic|port)\s+map\b/gi)].map((x) => x[1])
  ].map((x) => x.toLowerCase())
  return { entities, packages, instantiates: [...new Set(instantiates)] }
}

export function workDir(projectDir: string, std: Std): string {
  return join(projectDir, '.vhdlsim', `work-${std}`)
}

interface RunResult {
  code: number | null
  output: string
  killed: boolean
}

let current: ChildProcess | null = null

export function stopCurrent(): boolean {
  if (current && current.exitCode === null) {
    current.kill('SIGTERM')
    return true
  }
  return false
}

function run(cmd: string, args: string[], cwd: string, log: LogFn, timeoutMs = 0, quiet = false): Promise<RunResult> {
  return new Promise((resolve) => {
    let output = ''
    let killed = false
    const child = spawn(cmd, args, { cwd, env: toolEnv() })
    current = child
    const timer = timeoutMs
      ? setTimeout(() => {
          killed = true
          child.kill('SIGTERM')
        }, timeoutMs)
      : null
    const onData = (kind: LogKind) => (buf: Buffer) => {
      const s = buf.toString()
      output += s
      if (!quiet) for (const l of s.split(/\r?\n/)) if (l.trim() && !/simulation stopped by --stop-time/.test(l)) log(kind, l)
    }
    child.stdout.on('data', onData('out'))
    child.stderr.on('data', onData('err'))
    child.on('error', (e) => {
      output += String(e)
      log('err', String(e))
    })
    child.on('close', (code, signal) => {
      if (timer) clearTimeout(timer)
      if (current === child) current = null
      resolve({ code, output, killed: killed || signal !== null })
    })
  })
}

const stdArgs = (std: Std, wd: string) => [`--std=${std}`, `--workdir=${wd}`, '-fsynopsys', '-frelaxed']

/** Order heuristics: packages first, then entities with ports, testbenches last. */
function orderFiles(files: string[]): string[] {
  const rank = (f: string) => {
    try {
      const u = scanUnits(readFileSync(f, 'utf8'))
      if (u.packages.length) return 0
      if (u.entities.some((e) => !e.hasPorts)) return 2
      return 1
    } catch {
      return 1
    }
  }
  return files.map((f) => [rank(f), f] as const).sort((a, b) => a[0] - b[0]).map((x) => x[1])
}

/**
 * Analyze all files into a clean work library. Files that fail (e.g. a missing dependency)
 * are retried until no more progress is made; only diagnostics of the final pass are reported.
 */
export async function compileFiles(projectDir: string, files: string[], std: Std, log: LogFn) {
  const ghdl = findGhdl()
  if (!ghdl) {
    log('err', GHDL_MISSING_HINT)
    return { ok: false, diagnostics: [] as Diagnostic[], failed: files }
  }
  const wd = workDir(projectDir, std)
  rmSync(wd, { recursive: true, force: true })
  mkdirSync(wd, { recursive: true })

  let pending = orderFiles(files)
  const finalOut = new Map<string, string>()
  const warnOut = new Map<string, string>()
  let progress = true
  while (pending.length && progress) {
    progress = false
    const failed: string[] = []
    for (const f of pending) {
      const r = await run(ghdl, ['-a', ...stdArgs(std, wd), f], projectDir, log, 0, true)
      if (r.code === 0) {
        progress = true
        finalOut.delete(f)
        if (r.output.trim()) warnOut.set(f, r.output)
      } else {
        failed.push(f)
        finalOut.set(f, r.output)
      }
    }
    pending = failed
  }

  const diagnostics: Diagnostic[] = []
  for (const f of files) {
    const out = (warnOut.get(f) ?? '') + (finalOut.get(f) ?? '')
    const failed = finalOut.has(f)
    log('cmd', `vcom ${basename(f)}`)
    for (const l of out.split(/\r?\n/)) {
      if (!l.trim() || /ghdl(?:\S*)?:error: compilation error/.test(l)) continue
      log(/:error:/.test(l) || (failed && !/:warning:/.test(l)) ? 'err' : 'warn', l)
    }
    diagnostics.push(...parseDiagnostics(out).filter((d) => d.file === f || failed))
    log(failed ? 'err' : 'ok', failed ? `** Error: ${basename(f)} failed to compile.` : `-- Compiled ${basename(f)}`)
  }
  const errors = diagnostics.filter((d) => d.severity === 'error').length
  const warnings = diagnostics.filter((d) => d.severity === 'warning').length
  const ok = pending.length === 0
  log(ok ? 'ok' : 'err', `Compile ${ok ? 'finished' : 'FAILED'}: ${files.length} file(s), Errors: ${errors}, Warnings: ${warnings}`)
  return { ok, diagnostics, failed: pending }
}

/** Default safety limit for `run -all` with a testbench that never stops. */
export const RUN_ALL_TIMEOUT_MS = 60_000
/** Largest VCD the waveform viewer is asked to load. */
export const MAX_VCD_BYTES = 200e6

/**
 * Elaborate `top` and simulate from 0 up to `stopFs` femtoseconds (or until the testbench
 * stops by itself for 'all'), dumping every signal to a VCD file.
 */
export async function simulate(projectDir: string, top: string, stopFs: number | 'all', std: Std, log: LogFn, forceWrapperSrc?: string) {
  const ghdl = findGhdl()
  if (!ghdl) {
    log('err', GHDL_MISSING_HINT)
    return { ok: false }
  }
  const wd = workDir(projectDir, std)
  if (!existsSync(wd)) {
    log('err', '** Error: work library is empty — compile the project first.')
    return { ok: false }
  }
  const exe = join(wd, `${top}.sim`)
  const vcdPath = join(wd, `${top}.vcd`)
  log('cmd', `vsim work.${top}`)
  let unit = top
  if (forceWrapperSrc) {
    // forces are applied by a generated testbench around the top entity
    const wrapperPath = join(wd, `${FORCE_TB}.vhd`)
    writeFileSync(wrapperPath, forceWrapperSrc)
    const a = await run(ghdl, ['-a', ...stdArgs(std, wd), wrapperPath], projectDir, log)
    if (a.code !== 0) {
      log('err', '** Error: could not apply the force commands (see messages above).')
      return { ok: false }
    }
    unit = FORCE_TB
  }
  const e = await run(ghdl, ['-e', ...stdArgs(std, wd), '-o', exe, unit], projectDir, log)
  if (e.code !== 0) {
    log('err', `** Error: elaboration of ${top} failed.`)
    return { ok: false }
  }
  const args = [`--vcd=${vcdPath}`, '--ieee-asserts=disable-at-0']
  if (stopFs !== 'all') args.push(`--stop-time=${Math.round(stopFs / 1000)}ps`)
  log('cmd', stopFs === 'all' ? 'run -all' : `run ${formatTime(stopFs)}`)
  // keep the VCD loadable: stop the simulator if the dump grows beyond the limit
  let tooBig = false
  const watch = setInterval(() => {
    try {
      if (statSync(vcdPath).size > MAX_VCD_BYTES) {
        tooBig = true
        stopCurrent()
      }
    } catch {
      /* not created yet */
    }
  }, 250)
  const r = await run(exe, args, projectDir, log, stopFs === 'all' ? RUN_ALL_TIMEOUT_MS : 0)
  clearInterval(watch)
  if (tooBig) {
    log('warn', `** Warning: waveform reached ${MAX_VCD_BYTES / 1e6} MB — simulation stopped there. Use a shorter run time.`)
  } else if (r.killed) {
    log('warn', `** Warning: simulation stopped (timeout of ${RUN_ALL_TIMEOUT_MS / 1000}s or user break). Showing waves up to that point.`)
  }
  // GHDL exits with non-zero on assertion failure / std.env.stop(1); the VCD is still useful.
  const ok = existsSync(vcdPath)
  if (r.code !== 0 && !r.killed) log('warn', `Simulator exited with code ${r.code}.`)
  if (ok) log('ok', `Waveform written: ${vcdPath}`)
  return { ok, vcdPath: ok ? vcdPath : undefined, exitCode: r.code, forced: !!forceWrapperSrc }
}
