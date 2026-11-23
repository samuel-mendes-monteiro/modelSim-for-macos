import { describe, it, expect } from 'vitest'
import { formatValue, formatTime } from '../src/shared/radix'

describe('formatValue', () => {
  it('binary', () => expect(formatValue('1010', 'bin')).toBe('1010'))
  it('hex', () => {
    expect(formatValue('1010', 'hex')).toBe('A')
    expect(formatValue('100001111', 'hex')).toBe('10F')
  })
  it('unsigned', () => expect(formatValue('11111111', 'unsigned')).toBe('255'))
  it('signed', () => {
    expect(formatValue('1111', 'signed')).toBe('-1')
    expect(formatValue('0111', 'signed')).toBe('7')
    expect(formatValue('1000', 'signed')).toBe('-8')
  })
  it('wide unsigned uses bigint', () => expect(formatValue('1'.repeat(70), 'unsigned')).toBe((2n ** 70n - 1n).toString()))
  it('metavalues', () => {
    expect(formatValue('1x10', 'hex')).toBe('X')
    expect(formatValue('zzzz', 'hex')).toBe('Z')
    expect(formatValue('UUUU', 'unsigned')).toBe('U')
    expect(formatValue('1x10', 'bin')).toBe('1X10')
  })
})

describe('formatTime', () => {
  it('picks a readable unit', () => {
    expect(formatTime(0)).toBe('0 ns')
    expect(formatTime(5_000_000)).toBe('5 ns')
    expect(formatTime(1_500_000_000)).toBe('1.5 us')
    expect(formatTime(250_000)).toBe('250 ps')
  })
})
