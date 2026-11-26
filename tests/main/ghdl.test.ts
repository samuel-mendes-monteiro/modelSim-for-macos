import { describe, it, expect } from 'vitest'
import { mkdtempSync, cpSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compileFiles } from '../../src/main/ghdl/compile'
import { parseDiagnostics } from '../../src/main/ghdl/diagnostics'
import type { LogFn } from '../../src/main/ghdl/process'
import { simulate } from '../../src/main/ghdl/simulate'
import { findGhdl } from '../../src/main/ghdl/toolchain'
import { parseVcd } from '@shared/waveform/vcd'

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

const ghdl = findGhdl()
describe.skipIf(!ghdl)('GHDL integration', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vhdl sim '))
  cpSync(join(__dirname, '../../examples/counter'), dir, { recursive: true })
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
