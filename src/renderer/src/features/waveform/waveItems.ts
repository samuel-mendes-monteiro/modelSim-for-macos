/**
 * The list of signals shown in the wave window (`WaveItem[]`, saved in the session) and the rows
 * derived from it. Pure functions: every change returns a new list.
 */
import { defaultRadix, type Radix } from '@shared/waveform/radix'
import type { VcdData, VcdSignal } from '@shared/waveform/vcd'

export interface WaveItem {
  /** full signal path, e.g. /tb/uut/clk */
  key: string
  radix: Radix
  /** bus expanded into one row per bit (ModelSim "+") */
  expanded?: boolean
}

/** A displayed row: a wave item, or one bit of an expanded bus (`bit` set). `wi` = index in the item list. */
export interface Row {
  key: string
  radix: Radix
  sig?: VcdSignal
  wi: number
  bit: number | null
  expanded?: boolean
}

export const signalKey = (s: VcdSignal) => '/' + s.scope.concat(s.name).join('/')

export const isBus = (s: VcdSignal | undefined) => !!s && s.width > 1 && s.kind !== 'real'

export const newItem = (s: VcdSignal): WaveItem => ({ key: signalKey(s), radix: defaultRadix(s.width) })

const bitCache = new WeakMap<VcdSignal, Map<number, VcdSignal>>()

/** Scalar signal for bit `b` (b = 0 is the rightmost bit) of a vector. Cached per signal. */
export function bitSignal(sig: VcdSignal, b: number): VcdSignal {
  let m = bitCache.get(sig)
  if (!m) bitCache.set(sig, (m = new Map()))
  let out = m.get(b)
  if (!out) {
    const changes: VcdSignal['changes'] = []
    for (const c of sig.changes) {
      const v = c.v[c.v.length - 1 - b] ?? c.v[0]
      if (!changes.length || changes[changes.length - 1].v !== v) changes.push({ t: c.t, v })
    }
    out = { ...sig, name: `${sig.name}(${b})`, width: 1, changes }
    m.set(b, out)
  }
  return out
}

export function indexSignals(data: VcdData | null): Map<string, VcdSignal> {
  const m = new Map<string, VcdSignal>()
  data?.signals.forEach((s) => m.set(signalKey(s), s))
  return m
}

/** Rows to display: each item, followed by its bits (MSB first) when expanded. */
export function buildRows(items: WaveItem[], byKey: Map<string, VcdSignal>): Row[] {
  const out: Row[] = []
  items.forEach((w, wi) => {
    const sig = byKey.get(w.key)
    out.push({ ...w, sig, wi, bit: null })
    if (w.expanded && sig && isBus(sig))
      for (let b = sig.width - 1; b >= 0; b--) out.push({ key: `${w.key}(${b})`, radix: 'bin', sig: bitSignal(sig, b), wi, bit: b })
  })
  return out
}

/**
 * Items after loading new data: keep the ones that still exist; if none, show every signal of
 * the top instance ("add wave *"), or the first 50 signals.
 */
export function itemsForData(items: WaveItem[], data: VcdData, top?: string): WaveItem[] {
  const keys = new Set(data.signals.map(signalKey))
  const kept = items.filter((w) => keys.has(w.key))
  if (kept.length) return kept
  const scopeName = top ?? data.signals.find((s) => s.scope.length)?.scope[0]
  const sigs = data.signals.filter((s) => s.scope.length === 1 && s.scope[0] === scopeName)
  return (sigs.length ? sigs : data.signals.slice(0, 50)).map(newItem)
}

/** Append signals that are not in the list yet. */
export function addSignals(items: WaveItem[], sigs: VcdSignal[]): WaveItem[] {
  const have = new Set(items.map((w) => w.key))
  const add = sigs.filter((s) => !have.has(signalKey(s))).map(newItem)
  return add.length ? [...items, ...add] : items
}

/** Signals matching a ModelSim pattern: `*`, `clk`, `/tb/uut/*` (relative patterns are under /top/). */
export function matchSignals(pattern: string, top: string, signals: VcdSignal[]): VcdSignal[] {
  const full = pattern.startsWith('/') ? pattern : `/${top}/${pattern}`
  const re = new RegExp(
    '^' +
      full
        .split('*')
        .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
        .join('[^/]*') +
      '$',
    'i'
  )
  return signals.filter((s) => re.test(signalKey(s)))
}

export const setRadix = (items: WaveItem[], wi: number, radix: Radix) => items.map((w, j) => (j === wi ? { ...w, radix } : w))
export const setRadixAll = (items: WaveItem[], radix: Radix) => items.map((w) => ({ ...w, radix }))
export const toggleExpand = (items: WaveItem[], wi: number) => items.map((w, j) => (j === wi ? { ...w, expanded: !w.expanded } : w))
export const removeItem = (items: WaveItem[], wi: number) => items.filter((_, j) => j !== wi)

export function moveItem(items: WaveItem[], from: number, to: number): WaveItem[] {
  if (from === to) return items
  const next = items.slice()
  const [m] = next.splice(from, 1)
  next.splice(to, 0, m)
  return next
}
