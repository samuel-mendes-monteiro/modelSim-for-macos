import { describe, it, expect } from 'vitest'
import type { VcdData, VcdSignal } from '@shared/waveform/vcd'
import { edgeFrom, fitView, niceStep, rulerStep, snapToEdge, zoomView } from '../../src/renderer/src/features/waveform/timeAxis'
import { resizeColumns } from '../../src/renderer/src/features/waveform/useColumnWidths'
import { buildScopes } from '../../src/renderer/src/features/waveform/scopes'
import * as items from '../../src/renderer/src/features/waveform/waveItems'

const sig = (scope: string[], name: string, width: number, changes: [number, string][]): VcdSignal => ({
  id: name,
  name,
  scope,
  width,
  kind: 'reg',
  changes: changes.map(([t, v]) => ({ t, v }))
})
const clk = sig(['tb'], 'clk', 1, [[0, '0'], [5, '1'], [10, '0'], [15, '1']])
const a = sig(['tb'], 'a', 2, [[0, '00'], [20, '01'], [30, '10']])
const q = sig(['tb', 'uut'], 'q', 1, [[0, 'U'], [7, '1']])
const data: VcdData = { timescaleFs: 1e6, endTime: 40, signals: [clk, a, q] }

describe('wave items', () => {
  it('defaults to the top instance signals with binary radix for small buses', () => {
    expect(items.itemsForData([], data, 'tb')).toEqual([
      { key: '/tb/clk', radix: 'bin' },
      { key: '/tb/a', radix: 'bin' }
    ])
    // existing items that still exist are kept
    expect(items.itemsForData([{ key: '/tb/uut/q', radix: 'hex' }, { key: '/gone', radix: 'hex' }], data)).toEqual([{ key: '/tb/uut/q', radix: 'hex' }])
  })
  it('expands a bus into one row per bit, MSB first', () => {
    const rows = items.buildRows([{ key: '/tb/a', radix: 'bin', expanded: true }], items.indexSignals(data))
    expect(rows.map((r) => r.key)).toEqual(['/tb/a', '/tb/a(1)', '/tb/a(0)'])
    expect(rows[2].sig!.changes).toEqual([{ t: 0, v: '0' }, { t: 20, v: '1' }, { t: 30, v: '0' }])
  })
  it('matches ModelSim patterns', () => {
    expect(items.matchSignals('*', 'tb', data.signals).map((s) => s.name)).toEqual(['clk', 'a'])
    expect(items.matchSignals('/tb/uut/*', 'tb', data.signals).map((s) => s.name)).toEqual(['q'])
  })
  it('adds, moves and removes without duplicates', () => {
    const list = items.addSignals([{ key: '/tb/clk', radix: 'bin' }], [clk, q])
    expect(list.map((w) => w.key)).toEqual(['/tb/clk', '/tb/uut/q'])
    expect(items.moveItem(list, 1, 0).map((w) => w.key)).toEqual(['/tb/uut/q', '/tb/clk'])
    expect(items.removeItem(list, 0).map((w) => w.key)).toEqual(['/tb/uut/q'])
  })
  it('builds the instance tree', () => {
    expect(buildScopes(data).map((s) => s.path.join('/'))).toEqual(['tb', 'tb/uut'])
  })
})

describe('time axis', () => {
  it('chooses 1-2-5 ruler steps in whole time units', () => {
    expect(niceStep(37)).toBe(50)
    expect(niceStep(0.13)).toBeCloseTo(0.2)
    expect(rulerStep({ start: 0, scale: 0.001 }, 1)).toBe(1)
  })
  it('zooms around the pointer and fits the whole run', () => {
    const v = zoomView({ start: 0, scale: 1 }, 0.5, 100, 1000)
    expect(v.start + 100 * v.scale).toBeCloseTo(100)
    expect(fitView(1000, 520)).toEqual({ start: 0, scale: 2 })
  })
  it('snaps cursors to edges and jumps between edges', () => {
    expect(snapToEdge(9, clk, 1)).toBe(10)
    expect(snapToEdge(30, undefined, 1)).toBe(30)
    expect(edgeFrom(clk, 5, 1)).toBe(10)
    expect(edgeFrom(clk, 10, -1)).toBe(5)
  })
})

describe('column widths', () => {
  it('shrinks the Value column first, then the names, never below the minimum', () => {
    expect(resizeColumns('total', [230, 110], -50)).toEqual([230, 60])
    expect(resizeColumns('total', [230, 110], -500)).toEqual([60, 40])
    expect(resizeColumns('name', [230, 110], 20)).toEqual([250, 110])
  })
})
