import { describe, it, expect } from 'vitest'
import type { EntityInfo } from '@shared/project'
import { parseForce, type ForceCmd } from '@shared/simulation/force'
import { forceError, suggestedForceValue, undrivenWarnings } from '../../src/renderer/src/features/simulation/checks'
import { parseSession, serializeSession } from '../../src/renderer/src/features/simulation/session'

const counter: EntityInfo = { name: 'counter', hasPorts: true, inputs: ['clk', 'rst'], top: false }
const f = (s: string) => parseForce(s, 0) as ForceCmd

describe('run checks', () => {
  it('warns about undriven inputs and suggests force or a testbench', () => {
    const w = undrivenWarnings(counter, [], ['counter_tb'])
    expect(w[0]).toContain('clk, rst')
    expect(w[1]).toContain('counter_tb')
    expect(undrivenWarnings(counter, [f('clk 0')], [])).toEqual(["** Warning: inputs not forced (stay 'U'): rst"])
    expect(undrivenWarnings(counter, [f('clk 0'), f('rst 1')], [])).toEqual([])
  })
  it('only allows forcing inputs of the top', () => {
    expect(forceError('clk', counter)).toBeNull()
    expect(forceError('q', counter)).toContain('not an input port')
  })
  it('suggests a clock, zeros or the current force', () => {
    expect(suggestedForceValue('clk', 1, [])).toBe('0 0, 1 50 ns -repeat 100 ns')
    expect(suggestedForceValue('d', 4, [])).toBe('0000')
    expect(suggestedForceValue('rst', 1, [f('rst 1')])).toBe('1')
  })
})

describe('session file', () => {
  it('round-trips and ignores wave lists from older versions', () => {
    const s = { waves: [{ key: '/tb/a', radix: 'bin' as const }], forces: [f('clk 0')] }
    expect(parseSession(serializeSession(s))).toEqual(s)
    expect(parseSession(JSON.stringify({ waves: s.waves, forces: [] }))).toEqual({ waves: null, forces: [] })
    expect(parseSession('not json')).toEqual({ waves: null, forces: null })
  })
})
