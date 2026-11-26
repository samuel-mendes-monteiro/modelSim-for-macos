/** `vcom`: analyse all project files into a clean work library. */
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { basename } from 'node:path'
import type { CompileResult } from '@shared/contract'
import type { Diagnostic, Std } from '@shared/project'
import { scanUnits } from '@shared/vhdl/scan'
import { parseDiagnostics } from './diagnostics'
import { run, type LogFn } from './process'
import { findGhdl, GHDL_MISSING_HINT, stdArgs, workDir } from './toolchain'

/** Order heuristics: packages first, then entities with ports, testbenches last. */
export function orderFiles(files: string[], read = (f: string) => readFileSync(f, 'utf8')): string[] {
  const rank = (f: string) => {
    try {
      const u = scanUnits(read(f))
      if (u.packages.length) return 0
      if (u.entities.some((e) => !e.hasPorts)) return 2
      return 1
    } catch {
      return 1
    }
  }
  return files
    .map((f) => [rank(f), f] as const)
    .sort((a, b) => a[0] - b[0])
    .map((x) => x[1])
}

/**
 * Files that fail (e.g. a dependency not analysed yet) are retried until no more progress is
 * made, so the user never has to order files by hand. Only the final pass is reported.
 */
export async function compileFiles(projectDir: string, files: string[], std: Std, log: LogFn): Promise<CompileResult> {
  const ghdl = findGhdl()
  if (!ghdl) {
    log('err', GHDL_MISSING_HINT)
    return { ok: false, diagnostics: [], failed: files }
  }
  const wd = workDir(projectDir, std)
  rmSync(wd, { recursive: true, force: true })
  mkdirSync(wd, { recursive: true })

  let pending = orderFiles(files)
  const errorOut = new Map<string, string>()
  const warnOut = new Map<string, string>()
  let progress = true
  while (pending.length && progress) {
    progress = false
    const failed: string[] = []
    for (const f of pending) {
      const r = await run(ghdl, ['-a', ...stdArgs(std, wd), f], projectDir, log, { quiet: true })
      if (r.code === 0) {
        progress = true
        errorOut.delete(f)
        if (r.output.trim()) warnOut.set(f, r.output)
      } else {
        failed.push(f)
        errorOut.set(f, r.output)
      }
    }
    pending = failed
  }

  const diagnostics: Diagnostic[] = []
  for (const f of files) {
    const out = (warnOut.get(f) ?? '') + (errorOut.get(f) ?? '')
    const failed = errorOut.has(f)
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
