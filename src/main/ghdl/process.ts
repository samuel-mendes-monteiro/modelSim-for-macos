/** Running GHDL and the simulation executable as child processes, one at a time. */
import { spawn, type ChildProcess } from 'node:child_process'
import type { LogKind } from '@shared/contract'
import { toolEnv } from './toolchain'

export type LogFn = (kind: LogKind, text: string) => void

export interface RunResult {
  code: number | null
  output: string
  /** stopped by the timeout, by Break or by a signal */
  killed: boolean
}

export interface RunOptions {
  /** kill the process after this many ms (0 = no limit) */
  timeoutMs?: number
  /** collect output without logging it line by line */
  quiet?: boolean
}

/** GHDL lines that are noise for the user. */
const HIDDEN_LINE = /simulation stopped by --stop-time/

let current: ChildProcess | null = null

/** Stop the running process (Break). Returns false when nothing is running. */
export function stopCurrent(): boolean {
  if (current && current.exitCode === null) {
    current.kill('SIGTERM')
    return true
  }
  return false
}

export function run(cmd: string, args: string[], cwd: string, log: LogFn, { timeoutMs = 0, quiet = false }: RunOptions = {}): Promise<RunResult> {
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
      if (!quiet) for (const l of s.split(/\r?\n/)) if (l.trim() && !HIDDEN_LINE.test(l)) log(kind, l)
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
