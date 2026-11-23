import { describe, it, expect } from 'vitest'
import { mkdtempSync, cpSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseDiagnostics, scanUnits, findGhdl, compileFiles, simulate, LogFn } from '../src/main/ghdl'
import { parseVcd } from '../src/shared/vcd'

describe('parseDiagnostics', () => {
  it('parses errors and warnings with spaces in the path', () => {
    const out = [
      '/Users/a b/my proj/counter_tb.vhd:16:21:error: unit "counter" not found in library "work"',
      '  dut : entity work.counter',
      '/Users/a b/my proj/x.vhd:3:1:warning: declaration of "s" hides signal "s" [-Whide]',
      '/opt/ghdl/bin/ghdl:error: compilation error'
    ].join('\n')
    expect(parseDiagnostics(out)).toEqual([
      { file: '/Users/a b/my proj/counter_tb.vhd', line: 16, col: 21, severity: 'error', message: 'unit "counter" not found in library "work"' },
      { file: '/Users/a b/my proj/x.vhd', line: 3, col: 1, severity: 'warning', message: 'declaration of "s" hides signal "s" [-Whide]' }
    ])
  })
})

describe('scanUnits', () => {
  it('detects entities, ports and packages, ignoring comments', () => {
    const src = `-- entity fake is port(a: in bit); end;
      library ieee; package my_pkg is end package;
      entity Foo is port ( a : in bit ); end entity;
      entity foo_tb is
      end foo_tb;`
    expect(scanUnits(src)).toEqual({
      entities: [{ name: 'foo', hasPorts: true, inputs: ['a'] }, { name: 'foo_tb', hasPorts: false, inputs: [] }],
      packages: ['my_pkg'],
      instantiates: []
    })
  })

  it('finds input ports (default mode = in, generics ignored) and instantiations', () => {
    const src = `entity top is
        generic ( N : integer := 4 );
        port ( clk, rst : in std_logic; d : std_logic_vector(3 downto 0);
               b : inout bit; q : out std_logic; r : buffer bit );
      end top;
      architecture a of top is begin
        u1: entity work.contador10 port map (clock => clk);
        u2 : component Relogio port map (clock => clk);
        u3: estimulo port map (clock => clk);
      end a;
      entity gen is port ( hora : out bit ); end gen;`
    const u = scanUnits(src)
    expect(u.entities).toEqual([
      { name: 'top', hasPorts: true, inputs: ['clk', 'rst', 'd', 'b'] },
      { name: 'gen', hasPorts: true, inputs: [] }
    ])
    expect(u.instantiates.sort()).toEqual(['contador10', 'estimulo', 'relogio'])
  })
})

const ghdl = findGhdl()
describe.skipIf(!ghdl)('GHDL integration', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vhdl sim '))
  cpSync(join(__dirname, '../examples/counter'), dir, { recursive: true })
  const logs: string[] = []
  const log: LogFn = (_k, t) => logs.push(t)

  it('compiles files given in the wrong order', async () => {
    const files = [join(dir, 'counter_tb.vhd'), join(dir, 'counter.vhd')]
    const r = await compileFiles(dir, files, '08', log)
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
    expect(r.ok).toBe(true)
  })

  it('simulates to a stop time and writes a VCD with internal signals', async () => {
    const r = await simulate(dir, 'counter_tb', 100_000_000, '08', log)
    expect(r.ok).toBe(true)
    expect(existsSync(r.vcdPath!)).toBe(true)
    const d = parseVcd(readFileSync(r.vcdPath!, 'utf8'))
    const names = d.signals.map((s) => s.scope.concat(s.name).join('.'))
    expect(names).toContain('counter_tb.count')
    expect(names).toContain('counter_tb.dut.cnt')
    expect(d.endTime * d.timescaleFs).toBeLessThanOrEqual(100_000_000)
  })

  it('runs "all" until the testbench stops by itself', async () => {
    const r = await simulate(dir, 'counter_tb', 'all', '08', log)
    expect(r.ok).toBe(true)
    expect(logs.join('\n')).toMatch(/Simulation finished/)
  })

  it('reports syntax errors with file and line', async () => {
    const bad = join(dir, 'counter.vhd')
    const { writeFileSync } = await import('node:fs')
    writeFileSync(bad, readFileSync(bad, 'utf8').replace('cnt <= cnt + 1;', 'cnt <= cnt + 1'))
    const r = await compileFiles(dir, [bad], '08', log)
    expect(r.ok).toBe(false)
    expect(r.diagnostics[0]).toMatchObject({ file: bad, line: 25, severity: 'error' })
  })
})
