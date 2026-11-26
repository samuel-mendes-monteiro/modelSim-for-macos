import { describe, it, expect } from 'vitest'
import { addForce, describeForce, FORCE_TB, parseForce, removeForces, unwrapForcedVcd, type ForceCmd } from '@shared/simulation/force'
import type { VcdData } from '@shared/waveform/vcd'

const NS = 1e6

describe('parseForce', () => {
  it('parses a ModelSim clock with braces and -repeat', () => {
    expect(parseForce('-freeze sim:/contador10/clock 0 0, 1 {50 ns} -r 100', 200 * NS)).toEqual({
      signal: 'clock',
      start: 200 * NS,
      pairs: [{ v: '0', t: 0 }, { v: '1', t: 50 * NS }],
      repeat: 100 * NS
    })
  })
  it('accepts a single value and default ns units', () => {
    expect(parseForce('reset 1', 0)).toEqual({ signal: 'reset', start: 0, pairs: [{ v: '1', t: 0 }], repeat: undefined })
    expect(parseForce('en 0, 1 20', 0)).toMatchObject({ pairs: [{ v: '0', t: 0 }, { v: '1', t: 20 * NS }] })
  })
  it('rejects bad input', () => {
    expect(typeof parseForce('clock', 0)).toBe('string')
    expect(typeof parseForce('clock 0 0, 1 50, 0 20', 0)).toBe('string')
    expect(typeof parseForce('clock 0 0, 1 50 -repeat 40', 0)).toBe('string')
  })
})

describe('force list', () => {
  const f = (s: string, now = 0) => parseForce(s, now) as ForceCmd
  it('a new force replaces later commands on the same signal only', () => {
    const list = addForce([f('clk 0'), f('rst 1'), f('clk 1', 50 * NS)], f('clk 0 0, 1 5 -repeat 10', 20 * NS))
    expect(list.map((x) => `${x.signal}@${x.start / NS}`)).toEqual(['clk@0', 'rst@0', 'clk@20'])
  })
  it('noforce removes one signal or all', () => {
    const list = [f('clk 0'), f('rst 1')]
    expect(removeForces(list, ['rst']).map((x) => x.signal)).toEqual(['clk'])
    expect(removeForces(list, ['*'])).toEqual([])
  })
  it('describes a force in ModelSim syntax', () => {
    expect(describeForce(f('clock 0 0, 1 50 -repeat 100'))).toBe('force clock 0, 1 {50 ns} -repeat {100 ns}')
  })
})

describe('unwrapForcedVcd', () => {
  it('shows the wrapped design under its own name and hides the wrapper signals', () => {
    const sig = (scope: string[], name: string) => ({ id: name, name, scope, width: 1, kind: 'reg', changes: [] })
    const data: VcdData = {
      timescaleFs: 1,
      endTime: 10,
      signals: [sig([FORCE_TB], 'clk'), sig([FORCE_TB, 'dut'], 'clk'), sig([FORCE_TB, 'dut', 'u1'], 'q')]
    }
    expect(unwrapForcedVcd(data, 'counter').signals.map((s) => '/' + [...s.scope, s.name].join('/'))).toEqual(['/counter/clk', '/counter/u1/q'])
  })
})
