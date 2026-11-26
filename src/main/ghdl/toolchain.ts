/** Locating GHDL and preparing the environment and arguments it runs with. */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import type { GhdlStatus } from '@shared/contract'
import type { Std } from '@shared/project'

const EXTRA_PATHS = ['/opt/homebrew/bin', '/usr/local/bin', join(homedir(), '.local/ghdl/bin'), '/usr/bin', '/bin']

export const GHDL_MISSING_HINT =
  'GHDL not found. Install the official arm64 build from https://github.com/ghdl/ghdl/releases ' +
  '(ghdl-llvm-*-macos*-aarch64.tar.gz) into ~/.local/ghdl, or set the GHDL environment variable.'

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

export async function ghdlStatus(): Promise<GhdlStatus> {
  const path = findGhdl()
  if (!path) return { path: null, version: null, hint: GHDL_MISSING_HINT }
  const version = await new Promise<string | null>((res) =>
    execFile(path, ['--version'], { env: toolEnv() }, (err, out) => res(err ? null : out.split('\n')[0]))
  )
  return { path, version, hint: '' }
}

/** Compiled library of a project; safe to delete at any time. */
export function workDir(projectDir: string, std: Std): string {
  return join(projectDir, '.vhdlsim', `work-${std}`)
}

/** Common GHDL options: standard, work library, and the relaxed rules ModelSim users expect. */
export function stdArgs(std: Std, wd: string): string[] {
  return [`--std=${std}`, `--workdir=${wd}`, '-fsynopsys', '-frelaxed']
}
