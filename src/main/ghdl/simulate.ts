/** `vsim` + `run`: elaborate the top entity and run it, dumping every signal to a VCD file. */
import { existsSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SimulateResult } from '@shared/contract'
import type { Std } from '@shared/project'
import { FORCE_TB } from '@shared/simulation/force'
import { formatTime } from '@shared/waveform/time'
import { run, stopCurrent, type LogFn } from './process'
import { findGhdl, GHDL_MISSING_HINT, stdArgs, workDir } from './toolchain'

/** Safety limit for `run -all` with a testbench that never stops. */
export const RUN_ALL_TIMEOUT_MS = 60_000
/** Largest VCD the waveform viewer is asked to load. */
export const MAX_VCD_BYTES = 200e6

/**
 * Simulate from 0 up to `stopFs` femtoseconds, or until the testbench stops by itself ('all').
 * With `forceWrapperSrc` the generated force testbench is analysed and simulated instead of `top`.
 */
export async function simulate(
  projectDir: string,
  top: string,
  stopFs: number | 'all',
  std: Std,
  log: LogFn,
  forceWrapperSrc?: string
): Promise<SimulateResult & { exitCode?: number | null }> {
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
  const r = await run(exe, args, projectDir, log, { timeoutMs: stopFs === 'all' ? RUN_ALL_TIMEOUT_MS : 0 })
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
