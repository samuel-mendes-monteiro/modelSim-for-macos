import { describe, it, expect } from 'vitest'
import { cpSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseForce } from '../src/shared/force'
import { forceWrapper, parseEntity, vhdlLiteral } from '../src/main/forceTb'
import { compileFiles, findGhdl, simulate, LogFn } from '../src/main/ghdl'
import { parseVcd, valueAt } from '../src/shared/vcd'

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

describe('vhdlLiteral', () => {
  it('converts values for scalar and vector types', () => {
    expect(vhdlLiteral('1', 'std_logic')).toBe("'1'")
    expect(vhdlLiteral("'z'", 'STD_LOGIC')).toBe("'Z'")
    expect(vhdlLiteral('0101', 'std_logic_vector(3 downto 0)')).toBe('"0101"')
    expect(vhdlLiteral('101', 'std_logic_vector(3 downto 0)')).toBe('"0101"')
    expect(vhdlLiteral('16#A', 'unsigned(3 downto 0)')).toBe('"1010"')
    expect(vhdlLiteral('x"5"', 'std_logic_vector(7 downto 0)')).toBe('"00000101"')
    expect(vhdlLiteral('9', 'std_logic_vector(WIDTH-1 downto 0)', { width: 4 })).toBe('"1001"')
    expect(vhdlLiteral('-1', 'signed(3 downto 0)')).toBe('"1111"')
    expect(vhdlLiteral('42', 'integer')).toBe('42')
  })
  it('throws on values that do not fit', () => {
    expect(() => vhdlLiteral('2', 'std_logic')).toThrow()
    expect(() => vhdlLiteral('16#1F', 'std_logic_vector(3 downto 0)')).toThrow(/fit/)
  })
})

describe('parseEntity', () => {
  it('reads ports, modes, types and generics', () => {
    const e = parseEntity(readFileSync(join(__dirname, '../examples/counter/counter.vhd'), 'utf8'), 'counter')!
    expect(e.generics).toEqual([{ name: 'width', type: 'natural', def: '8' }])
    expect(e.ports.map((p) => `${p.name}:${p.mode}:${p.type}`)).toEqual([
      'clk:in:std_logic',
      'rst:in:std_logic',
      'en:in:std_logic',
      'count:out:std_logic_vector(WIDTH-1 downto 0)',
      'tc:out:std_logic'
    ])
  })
  it('refuses to force outputs or unknown signals', () => {
    const src = readFileSync(join(__dirname, '../examples/counter/counter.vhd'), 'utf8')
    expect(() => forceWrapper(src, 'counter', [parseForce('tc 1', 0) as never])).toThrow(/output/)
    expect(() => forceWrapper(src, 'counter', [parseForce('nope 1', 0) as never])).toThrow(/not a port/)
  })
})

const ghdl = findGhdl()
describe.skipIf(!ghdl)('force integration (GHDL)', () => {
  it('simulates a design entity driven only by force commands', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vhdl force '))
    cpSync(join(__dirname, '../examples/counter'), dir, { recursive: true })
    const log: LogFn = () => {}
    const file = join(dir, 'counter.vhd')
    expect((await compileFiles(dir, [file], '08', log)).ok).toBe(true)
    const f = (s: string, now = 0) => parseForce(s, now) as Exclude<ReturnType<typeof parseForce>, string>
    // rst high for the first 20 ns, then released by a second force issued at 20 ns
    const forces = [f('clk 0 0, 1 5 -repeat 10'), f('rst 1'), f('en 1'), f('rst 0', 20 * NS)]
    const r = await simulate(dir, 'counter', 100 * NS, '08', log, forceWrapper(readFileSync(file, 'utf8'), 'counter', forces))
    expect(r.ok).toBe(true)
    const d = parseVcd(readFileSync(r.vcdPath!, 'utf8'))
    const sig = (path: string) => d.signals.find((s) => s.scope.concat(s.name).join('.') === path)!
    const cnt = sig('vhdlsim_force.dut.cnt')
    const at = (ns: number) => parseInt(valueAt(cnt, (ns * NS) / d.timescaleFs) ?? '', 2)
    expect(at(19)).toBe(0) // held in reset
    // rising edges at 25, 35, ... 95 ns → 8 increments by 100 ns
    expect(at(99)).toBe(8)
    expect(valueAt(sig('vhdlsim_force.dut.clk'), (12 * NS) / d.timescaleFs)).toBe('0')
    expect(valueAt(sig('vhdlsim_force.dut.clk'), (17 * NS) / d.timescaleFs)).toBe('1')
  })
})
