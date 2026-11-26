/**
 * Painting of the wave window on two canvases (ruler and signals). Stateless: everything it
 * needs comes in `WaveScene`, so it can be changed without touching the React component.
 */
import { formatValue } from '@shared/waveform/radix'
import { formatTime } from '@shared/waveform/time'
import { changeIndexAt } from '@shared/waveform/vcd'
import { rulerStep, type View } from './timeAxis'
import type { Row } from './waveItems'

export const ROW_H = 24
export const RULER_H = 28

export const COLORS = {
  bg: '#000000',
  grid: '#1c2a1c',
  wave: '#3fe05a',
  waveSel: '#9dffad',
  x: '#ff4040',
  z: '#ffd24a',
  u: '#ff7a3d',
  text: '#e8ffe8',
  ruler: '#141414',
  rulerText: '#bdbdbd',
  c1: '#ffe14d',
  c2: '#4dd8ff'
}
const C = COLORS

export interface WaveScene {
  wave: HTMLCanvasElement
  ruler: HTMLCanvasElement
  /** CSS pixel size of the signal area */
  width: number
  height: number
  view: View
  rows: Row[]
  scrollTop: number
  selected: number | null
  cursors: [number | null, number | null]
  /** last displayed time (VCD units) */
  end: number
  timescaleFs: number
}

const isMeta = (v: string) => /[^01HLhl]/.test(v)

function scalarColor(v: string) {
  const c = v.toUpperCase()
  if (c === 'Z') return C.z
  if (c === 'U') return C.u
  if (c === '1' || c === '0' || c === 'H' || c === 'L') return C.wave
  return C.x
}

/** Resize a canvas backing store to `w`×`h` CSS pixels at the screen's pixel ratio. */
function fitCanvas(c: HTMLCanvasElement, w: number, h: number, dpr: number) {
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(w * dpr)
    c.height = Math.round(h * dpr)
    c.style.width = `${w}px`
    c.style.height = `${h}px`
  }
}

export function drawWaves(scene: WaveScene) {
  const { wave: cv, ruler: rc, view, rows, scrollTop, selected, cursors, end: endTime, timescaleFs: ts } = scene
  const dpr = window.devicePixelRatio || 1
  const W = scene.width
  const H = Math.max(0, scene.height)
  fitCanvas(cv, W, H, dpr)
  fitCanvas(rc, W, RULER_H, dpr)
  const g = cv.getContext('2d')!
  const r = rc.getContext('2d')!
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  r.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.fillStyle = C.bg
  g.fillRect(0, 0, W, H)
  r.fillStyle = C.ruler
  r.fillRect(0, 0, W, RULER_H)

  const toX = (t: number) => (t - view.start) / view.scale
  const t0 = view.start
  const t1 = view.start + W * view.scale

  // ruler + grid
  // ticks are whole multiples of the VCD time unit (no sub-unit labels like 0.6000000001 fs)
  const step = rulerStep(view, ts)
  r.font = '11px Menlo, monospace'
  r.textBaseline = 'top'
  g.strokeStyle = C.grid
  g.lineWidth = 1
  for (let i = Math.ceil(t0 / step), t = i * step; t <= t1; i++, t = i * step) {
    const x = Math.round(toX(t)) + 0.5
    r.strokeStyle = '#555'
    r.beginPath()
    r.moveTo(x, RULER_H - 8)
    r.lineTo(x, RULER_H)
    r.stroke()
    r.fillStyle = C.rulerText
    r.fillText(formatTime(t * ts), x + 3, 4)
    g.beginPath()
    g.moveTo(x, 0)
    g.lineTo(x, H)
    g.stroke()
  }
  const endX = toX(endTime)
  if (endX < W) {
    g.fillStyle = '#0b0b0b'
    g.fillRect(Math.max(0, endX), 0, W - Math.max(0, endX), H)
  }

  // rows
  g.font = '12px Menlo, monospace'
  g.textBaseline = 'middle'
  const first = Math.floor(scrollTop / ROW_H)
  const last = Math.min(rows.length - 1, Math.ceil((scrollTop + H) / ROW_H))
  for (let i = first; i <= last; i++) {
    const row = rows[i]
    const yTop = i * ROW_H - scrollTop
    if (i === selected) {
      g.fillStyle = 'rgba(70,110,180,0.18)'
      g.fillRect(0, yTop, W, ROW_H)
    }
    if (!row?.sig) continue
    const sig = row.sig
    const ch = sig.changes
    if (!ch.length) continue
    const hi = yTop + 4
    const lo = yTop + ROW_H - 4
    const mid = (hi + lo) / 2
    const scalar = sig.width === 1 && sig.kind !== 'real'
    let k = Math.max(0, changeIndexAt(sig, t0))
    const sel = i === selected
    g.lineWidth = sel ? 1.6 : 1.1
    while (k < ch.length) {
      const segStart = ch[k].t
      if (segStart > t1) break
      let x0 = Math.max(toX(Math.max(segStart, ch[0].t)), -2)
      let nextT = k + 1 < ch.length ? ch[k + 1].t : endTime
      let x1 = Math.min(toX(nextT), W + 2)
      // collapse sub-pixel activity into a dense block
      if (x1 - x0 < 2 && k + 1 < ch.length) {
        let j = k + 1
        while (j + 1 < ch.length && toX(ch[j + 1].t) - x0 < 3) j++
        x1 = Math.min(toX(ch[j].t), W + 2)
        g.fillStyle = scalar ? C.wave : C.wave
        g.globalAlpha = 0.55
        g.fillRect(x0, hi, Math.max(1, x1 - x0), lo - hi)
        g.globalAlpha = 1
        k = j
        continue
      }
      const v = ch[k].v
      if (scalar) {
        const col = scalarColor(v)
        g.strokeStyle = sel && col === C.wave ? C.waveSel : col
        const c = v.toUpperCase()
        g.beginPath()
        if (c === '1' || c === 'H') {
          g.moveTo(x0, hi)
          g.lineTo(x1, hi)
        } else if (c === '0' || c === 'L') {
          g.moveTo(x0, lo)
          g.lineTo(x1, lo)
        } else if (c === 'Z') {
          g.moveTo(x0, mid)
          g.lineTo(x1, mid)
        } else {
          g.fillStyle = col
          g.globalAlpha = 0.25
          g.fillRect(x0, hi, x1 - x0, lo - hi)
          g.globalAlpha = 1
          g.moveTo(x0, hi)
          g.lineTo(x1, hi)
          g.moveTo(x0, lo)
          g.lineTo(x1, lo)
        }
        g.stroke()
        // edge to next value
        if (k + 1 < ch.length && ch[k + 1].t <= t1) {
          const xn = Math.round(toX(ch[k + 1].t)) + 0.5
          g.strokeStyle = scalarColor(ch[k + 1].v) === C.wave && col === C.wave ? g.strokeStyle : C.x
          g.beginPath()
          g.moveTo(xn, hi)
          g.lineTo(xn, lo)
          g.stroke()
        }
      } else {
        const meta = sig.kind !== 'real' && isMeta(v)
        const allZ = /^z+$/i.test(v)
        const col = allZ ? C.z : meta ? (/^u+$/i.test(v) ? C.u : C.x) : C.wave
        g.strokeStyle = sel && col === C.wave ? C.waveSel : col
        const s = Math.min(3, (x1 - x0) / 2)
        g.beginPath()
        if (allZ) {
          g.moveTo(x0, mid)
          g.lineTo(x1, mid)
        } else {
          g.moveTo(x0, mid)
          g.lineTo(x0 + s, hi)
          g.lineTo(x1 - s, hi)
          g.lineTo(x1, mid)
          g.lineTo(x1 - s, lo)
          g.lineTo(x0 + s, lo)
          g.closePath()
          if (meta) {
            g.fillStyle = col
            g.globalAlpha = 0.2
            g.fill()
            g.globalAlpha = 1
          }
        }
        g.stroke()
        const label = sig.kind === 'real' ? v : formatValue(v, row.radix)
        const visL = Math.max(x0, 0) + s + 3
        const visR = Math.min(x1, W) - s - 3
        const avail = visR - visL
        if (avail > 8) {
          let text = label
          let tw = g.measureText(text).width
          if (tw > avail) {
            while (text.length > 1 && g.measureText(text + '…').width > avail) text = text.slice(0, -1)
            text += '…'
            tw = g.measureText(text).width
            if (tw > avail) text = ''
          }
          if (text) {
            g.fillStyle = C.text
            g.fillText(text, visL + (avail - tw) / 2, mid + 0.5)
          }
        }
      }
      k++
    }
  }

  // cursors
  const drawCursor = (t: number | null, color: string) => {
    if (t === null) return
    const x = Math.round(toX(t)) + 0.5
    if (x < -1 || x > W + 1) return
    g.strokeStyle = color
    g.lineWidth = 1
    g.beginPath()
    g.moveTo(x, 0)
    g.lineTo(x, H)
    g.stroke()
    const label = formatTime(t * ts)
    r.font = 'bold 11px Menlo, monospace'
    const tw = r.measureText(label).width + 8
    const bx = Math.min(Math.max(0, x - tw / 2), W - tw)
    r.fillStyle = color
    r.fillRect(bx, RULER_H - 14, tw, 14)
    r.fillStyle = '#000'
    r.textBaseline = 'middle'
    r.fillText(label, bx + 4, RULER_H - 7)
    r.textBaseline = 'top'
  }
  drawCursor(cursors[1], C.c2)
  drawCursor(cursors[0], C.c1)
}
