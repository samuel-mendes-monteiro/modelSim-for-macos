import { describe, it, expect } from 'vitest'
import { parseVcd, valueAt } from '@shared/waveform/vcd'

const SAMPLE = `$timescale 1 fs $end
$scope module tb $end
$var reg 1 ! clk $end
$var reg 4 " bus[3:0] $end
$scope module dut $end
$var reg 1 ! clk $end
$upscope $end
$upscope $end
$enddefinitions $end
#0
0!
bUUUU "
#5000000
1!
b1010 "
#10000000
0!
bx1z0 "
`

describe('parseVcd', () => {
  const d = parseVcd(SAMPLE)
  it('reads scopes, names and widths', () => {
    expect(d.signals.map((s) => s.scope.concat(s.name).join('.'))).toEqual(['tb.clk', 'tb.bus', 'tb.dut.clk'])
    expect(d.signals[1].width).toBe(4)
    expect(d.timescaleFs).toBe(1)
    expect(d.endTime).toBe(10000000)
  })
  it('shares changes between signals with the same id code', () => {
    expect(d.signals[2].changes).toEqual(d.signals[0].changes)
    expect(d.signals[0].changes.map((c) => c.v)).toEqual(['0', '1', '0'])
  })
  it('keeps vector values as bit strings, padded to width', () => {
    expect(d.signals[1].changes.map((c) => c.v)).toEqual(['UUUU', '1010', 'x1z0'])
  })
  it('valueAt returns the value active at a time', () => {
    expect(valueAt(d.signals[1], 7000000)).toBe('1010')
    expect(valueAt(d.signals[1], 0)).toBe('UUUU')
  })
  it('handles a timescale like "10 ns"', () => {
    expect(parseVcd('$timescale 10 ns $end\n$enddefinitions $end\n#3\n').timescaleFs).toBe(10_000_000)
  })
})
