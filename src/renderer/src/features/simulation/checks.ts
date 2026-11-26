/** Rules applied before a run and when forcing a signal. Pure: they return messages. */
import type { EntityInfo } from '@shared/project'
import { describeForce, type ForceCmd } from '@shared/simulation/force'

/** Warnings about top-level inputs that nothing drives (they stay 'U'). */
export function undrivenWarnings(top: EntityInfo | undefined, forces: ForceCmd[], tops: string[]): string[] {
  if (!top) return []
  const forced = new Set(forces.map((f) => f.signal))
  const undriven = top.inputs.filter((i) => !forced.has(i))
  if (!undriven.length) return []
  if (forces.length) return [`** Warning: inputs not forced (stay 'U'): ${undriven.join(', ')}`]
  return [
    `** Warning: top "${top.name}" has input ports that nothing drives (${undriven.join(', ')}): they stay 'U' and nothing happens.`,
    `   Drive them with force (e.g. "force ${undriven[0]} 0 0, 1 50 -repeat 100", or right-click the signal → Force…)` +
      (tops.length ? `, or simulate a testbench: ${tops.join(', ')}.` : ', or write a testbench.')
  ]
}

export const RUN_ALL_WITH_REPEAT =
  '** Error: run -all never ends while a force uses -repeat (the clock keeps running). Use run <time>, e.g. run 1 us.'

/** Error message when `signal` cannot be forced on `top`, or null. */
export function forceError(signal: string, top: EntityInfo | undefined): string | null {
  if (!top || top.inputs.includes(signal)) return null
  return `** Error: "${signal}" is not an input port of ${top.name}. Only top-level inputs can be forced (${top.inputs.join(', ') || 'none'}).`
}

/** Value suggested in the Force… dialog: the current force, a clock, or zeros. */
export function suggestedForceValue(signal: string, width: number, forces: ForceCmd[]): string {
  const cur = [...forces].reverse().find((f) => f.signal === signal)
  if (cur) return describeForce({ ...cur, start: 0 }).replace(/^force \S+ /, '')
  if (width === 1 && /cl(oc)?k/i.test(signal)) return '0 0, 1 50 ns -repeat 100 ns'
  return '0'.repeat(Math.max(1, width))
}
