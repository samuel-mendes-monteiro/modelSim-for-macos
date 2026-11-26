/**
 * Mapping between time and pixels in the wave window. Times are in VCD units
 * (multiply by `timescaleFs` for femtoseconds).
 */
import { changeIndexAt, type VcdData, type VcdSignal } from '@shared/waveform/vcd'

export interface View {
  /** VCD time units at x = 0 */
  start: number
  /** VCD time units per CSS pixel */
  scale: number
}

/** Cursor snapping distance to a signal edge, in pixels. */
export const SNAP_PX = 8
const MIN_SCALE = 0.01

/** Last time shown: the end of the dump, at least 1 ns so an empty run still has an axis. */
export function displayEnd(data: VcdData | null): number {
  return Math.max(1, data?.endTime ?? 1, data ? Math.round(1e6 / data.timescaleFs) : 1)
}

/** 1, 2 or 5 × 10^n just above `raw`. */
export function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(raw)))
  const n = raw / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p
}

/** Ruler tick spacing (~100 px) in whole VCD units, so labels never show fractions of a unit. */
export function rulerStep(view: View, timescaleFs: number): number {
  return Math.max(1, niceStep(100 * view.scale * timescaleFs) / timescaleFs)
}

export function fitView(end: number, width: number): View {
  return { start: 0, scale: end / Math.max(50, width - 20) }
}

/** Zoom by `factor` (<1 = in) keeping the time under pixel `px` fixed. */
export function zoomView(v: View, factor: number, px: number, end: number): View {
  const t = v.start + px * v.scale
  const scale = Math.min(Math.max(v.scale * factor, MIN_SCALE), end)
  return { scale, start: Math.max(0, t - px * scale) }
}

/** View that shows the interval between the two cursors with 5% margins. */
export function viewBetween(a: number, b: number, width: number): View {
  const lo = Math.min(a, b)
  const span = Math.max(a, b) - lo
  return { start: Math.max(0, lo - span * 0.05), scale: (span * 1.1) / width }
}

/** Move `t` to the nearest edge of `sig` when it is within SNAP_PX pixels. */
export function snapToEdge(t: number, sig: VcdSignal | undefined, scale: number): number {
  if (!sig) return Math.round(t)
  const k = changeIndexAt(sig, t)
  let best = t
  let bestD = SNAP_PX * scale
  for (const j of [k, k + 1]) {
    const c = sig.changes[j]
    if (c && Math.abs(c.t - t) < bestD) {
      bestD = Math.abs(c.t - t)
      best = c.t
    }
  }
  return Math.round(best)
}

/** Next (dir = 1) or previous (dir = -1) edge of `sig` from time `t` ("Find next edge"). */
export function edgeFrom(sig: VcdSignal, t: number, dir: 1 | -1): number | null {
  const k = changeIndexAt(sig, t)
  const c = dir === 1 ? sig.changes[k + 1] : sig.changes[sig.changes[k]?.t === t ? k - 1 : k]
  return c ? c.t : null
}
