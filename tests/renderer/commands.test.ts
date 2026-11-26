import { describe, it, expect } from 'vitest'
import { parseCommand } from '../../src/renderer/src/features/transcript/commands'

const NS = 1e6

describe('parseCommand', () => {
  it('parses simulation commands', () => {
    expect(parseCommand('vsim work.TB_Counter')).toEqual({ kind: 'vsim', entity: 'tb_counter' })
    expect(parseCommand('run')).toEqual({ kind: 'run', mode: 'step' })
    expect(parseCommand('run 250 ns')).toEqual({ kind: 'run', mode: 'step', lengthFs: 250 * NS })
    expect(parseCommand('run -all')).toEqual({ kind: 'run', mode: 'all' })
    expect(parseCommand('vcom')).toEqual({ kind: 'compile' })
  })
  it('parses wave and force commands', () => {
    expect(parseCommand('add wave /tb/uut/*')).toEqual({ kind: 'add-wave', pattern: '/tb/uut/*' })
    expect(parseCommand('add wave')).toEqual({ kind: 'add-wave', pattern: '*' })
    expect(parseCommand('delete wave *')).toEqual({ kind: 'delete-wave' })
    expect(parseCommand('radix decimal')).toEqual({ kind: 'radix', radix: 'signed' })
    expect(parseCommand('force')).toEqual({ kind: 'list-forces' })
    expect(parseCommand('force clk 0 0, 1 5 -r 10')).toEqual({ kind: 'force', args: 'clk 0 0, 1 5 -r 10' })
    expect(parseCommand('noforce /top/CLK rst')).toEqual({ kind: 'noforce', names: ['clk', 'rst'] })
    expect(parseCommand('std 93c')).toEqual({ kind: 'std', std: '93c' })
  })
  it('returns usage errors', () => {
    expect(parseCommand('vsim')).toEqual({ error: 'Usage: vsim <entity>' })
    expect(parseCommand('run soon')).toEqual({ error: 'Invalid time "soon".' })
    expect(parseCommand('add signal x')).toEqual({ error: 'Usage: add wave <pattern>' })
    expect(parseCommand('std 2019')).toEqual({ error: 'Usage: std <08|93c>' })
    expect(parseCommand('frobnicate')).toEqual({ error: 'Unknown command "frobnicate". Type "help".' })
  })
})
