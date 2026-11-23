import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { VcdData, VcdSignal, changeIndexAt, valueAt } from '@shared/vcd'
import { Radix, RADIX_LABEL, formatValue, formatTime, defaultRadix } from '@shared/radix'

export interface WaveItem {
  key: string
  radix: Radix
  /** bus expanded into one row per bit (ModelSim "+") */
  expanded?: boolean
}

/** A displayed row: a wave item, or one bit of an expanded bus (`bit` set). `wi` = index in `waves`. */
interface Row {
  key: string
  radix: Radix
  sig?: VcdSignal
  wi: number
  bit: number | null
  expanded?: boolean
}

const bitCache = new WeakMap<VcdSignal, Map<number, VcdSignal>>()
/** Scalar signal for bit `b` (b = 0 is the rightmost bit) of a vector. */
function bitSignal(sig: VcdSignal, b: number): VcdSignal {
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

export const signalKey = (s: VcdSignal) => '/' + s.scope.concat(s.name).join('/')

interface Props {
  data: VcdData | null
  waves: WaveItem[]
  onWavesChange: (w: WaveItem[]) => void
  title?: string
  /** keys of signals driven by `force` */
  forced?: Set<string>
  onForce?: (key: string, width: number) => void
  onNoForce?: (key: string) => void
}

const ROW_H = 24
const RULER_H = 28
const NAME_W = 230
const VALUE_W = 110
const MIN_NAME_W = 60
const MIN_VALUE_W = 40

function loadWidths(): [number, number] {
  try {
    const v = JSON.parse(localStorage.getItem('wave.widths') ?? 'null')
    if (Array.isArray(v) && v.every((n) => typeof n === 'number')) return [Math.max(MIN_NAME_W, v[0]), Math.max(MIN_VALUE_W, v[1])]
  } catch {
    /* storage unavailable */
  }
  return [NAME_W, VALUE_W]
}
const SNAP_PX = 8

const C = {
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
  c2: '#4dd8ff',
  rowSel: '#1d3557'
}

interface View {
  start: number // VCD time units at x = 0
  scale: number // VCD time units per CSS pixel
}

function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(raw)))
  const n = raw / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p
}

const isMeta = (v: string) => /[^01HLhl]/.test(v)
function scalarColor(v: string) {
  const c = v.toUpperCase()
  if (c === 'Z') return C.z
  if (c === 'U') return C.u
  if (c === '1' || c === '0' || c === 'H' || c === 'L') return C.wave
  return C.x
}

export default function Waveform({ data, waves, onWavesChange, title, forced, onForce, onNoForce }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rulerRef = useRef<HTMLCanvasElement>(null)
  const areaRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 600, h: 300 })
  const [scrollTop, setScrollTop] = useState(0)
  const [view, setView] = useState<View>({ start: 0, scale: 1 })
  const [cursors, setCursors] = useState<[number | null, number | null]>([null, null])
  const [selected, setSelected] = useState<number | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; index: number } | null>(null)
  const [showObjects, setShowObjects] = useState(true)
  const dragIndex = useRef<number | null>(null)
  const [[nameW, valueW], setWidths] = useState<[number, number]>(loadWidths)
  useEffect(() => {
    try {
      localStorage.setItem('wave.widths', JSON.stringify([nameW, valueW]))
    } catch {
      /* ignore */
    }
  }, [nameW, valueW])

  /**
   * Drag a column divider. 'total' = the line between the signal list and the waves:
   * shrinking takes from the Value column first, then from the names.
   */
  const startResize = (which: 'name' | 'total') => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const x0 = e.clientX
    const [n0, v0] = [nameW, valueW]
    const move = (ev: MouseEvent) => {
      const d = ev.clientX - x0
      if (which === 'name') setWidths([Math.max(MIN_NAME_W, n0 + d), v0])
      else {
        const total = Math.max(MIN_NAME_W + MIN_VALUE_W, n0 + v0 + d)
        const v = d >= 0 ? v0 + d : Math.max(MIN_VALUE_W, Math.min(v0, total - n0))
        setWidths([Math.max(MIN_NAME_W, total - v), v])
      }
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      document.body.classList.remove('col-resizing')
    }
    document.body.classList.add('col-resizing')
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const byKey = useMemo(() => {
    const m = new Map<string, VcdSignal>()
    data?.signals.forEach((s) => m.set(signalKey(s), s))
    return m
  }, [data])
  const rows = useMemo(() => {
    const out: Row[] = []
    waves.forEach((w, wi) => {
      const sig = byKey.get(w.key)
      out.push({ ...w, sig, wi, bit: null })
      if (w.expanded && sig && sig.width > 1 && sig.kind !== 'real')
        for (let b = sig.width - 1; b >= 0; b--) out.push({ key: `${w.key}(${b})`, radix: 'bin', sig: bitSignal(sig, b), wi, bit: b })
    })
    return out
  }, [waves, byKey])
  const toggleExpand = (wi: number) => onWavesChange(waves.map((w, j) => (j === wi ? { ...w, expanded: !w.expanded } : w)))
  const ts = data?.timescaleFs ?? 1
  // a simulation that ended at 0 still gets a readable 0..1 ns axis
  const endTime = Math.max(1, data?.endTime ?? 1, data ? Math.round(1e6 / data.timescaleFs) : 1)
  const fmt = useCallback((t: number) => formatTime(t * ts), [ts])

  const fit = useCallback(() => {
    setView({ start: 0, scale: endTime / Math.max(50, size.w - 20) })
  }, [endTime, size.w])

  // Fit on new data
  const lastData = useRef<VcdData | null>(null)
  useEffect(() => {
    if (data && data !== lastData.current) {
      const prevEnd = lastData.current?.endTime
      lastData.current = data
      if (prevEnd === undefined || prevEnd !== data.endTime) fit()
      setCursors(([a, b]) => [a !== null && a <= data.endTime ? a : null, b !== null && b <= data.endTime ? b : null])
    }
  }, [data, fit])

  useLayoutEffect(() => {
    const el = areaRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [showObjects, !!data])

  const zoomAt = useCallback((factor: number, x?: number) => {
    setView((v) => {
      const px = x ?? size.w / 2
      const t = v.start + px * v.scale
      const scale = Math.min(Math.max(v.scale * factor, 0.01), endTime)
      return { scale, start: Math.max(0, t - px * scale) }
    })
  }, [size.w, endTime])

  const zoomCursors = () => {
    const [a, b] = cursors
    if (a === null || b === null || a === b) return
    const lo = Math.min(a, b)
    const hi = Math.max(a, b)
    const span = hi - lo
    setView({ start: Math.max(0, lo - span * 0.05), scale: (span * 1.1) / size.w })
  }

  // ---------- drawing ----------
  const draw = useCallback(() => {
    const cv = canvasRef.current
    const rc = rulerRef.current
    if (!cv || !rc) return
    const dpr = window.devicePixelRatio || 1
    const W = size.w
    const H = Math.max(0, size.h)
    for (const [c, h] of [
      [cv, H],
      [rc, RULER_H]
    ] as const) {
      if (c.width !== Math.round(W * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(W * dpr)
        c.height = Math.round(h * dpr)
        c.style.width = `${W}px`
        c.style.height = `${h}px`
      }
    }
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
    const step = Math.max(1, niceStep(100 * view.scale * ts) / ts)
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
  }, [size, view, rows, scrollTop, cursors, selected, endTime, ts])

  useEffect(() => {
    const id = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(id)
  }, [draw])

  // ---------- interaction ----------
  const timeAtX = (x: number) => Math.max(0, Math.min(endTime, view.start + x * view.scale))

  const snap = (t: number, rowIdx: number | null) => {
    const sig = rowIdx !== null ? rows[rowIdx]?.sig : undefined
    if (!sig) return Math.round(t)
    const k = changeIndexAt(sig, t)
    let best = t
    let bestD = SNAP_PX * view.scale
    for (const j of [k, k + 1]) {
      const c = sig.changes[j]
      if (c && Math.abs(c.t - t) < bestD) {
        bestD = Math.abs(c.t - t)
        best = c.t
      }
    }
    return Math.round(best)
  }

  const onCanvasDown = (e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top + scrollTop
    const rowIdx = Math.floor(y / ROW_H)
    const onRuler = e.target === rulerRef.current
    const valid = !onRuler && rowIdx >= 0 && rowIdx < rows.length ? rowIdx : null
    if (valid !== null) setSelected(valid)
    const t = snap(timeAtX(x), valid)
    if (e.shiftKey || e.button === 2) setCursors(([a]) => [a, t])
    else setCursors(([, b]) => [t, b])
    if (e.button === 0 && !e.shiftKey) {
      const move = (ev: MouseEvent) => {
        const xx = ev.clientX - rect.left
        setCursors(([, b]) => [snap(timeAtX(xx), valid), b])
      }
      const up = () => {
        window.removeEventListener('mousemove', move)
        window.removeEventListener('mouseup', up)
      }
      window.addEventListener('mousemove', move)
      window.addEventListener('mouseup', up)
    }
  }

  const onWheel = (e: React.WheelEvent) => {
    const rect = areaRef.current!.getBoundingClientRect()
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      zoomAt(Math.exp(e.deltaY * 0.01), e.clientX - rect.left)
    } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) {
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      setView((v) => ({ ...v, start: Math.max(0, v.start + d * v.scale) }))
    }
  }

  // native non-passive listener so ctrl+wheel (pinch) can be prevented
  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    const h = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault()
    }
    el.addEventListener('wheel', h, { passive: false })
    return () => el.removeEventListener('wheel', h)
  }, [showObjects, !!data])

  /** `i` is a row index; bit rows act on their bus. */
  const removeRow = (i: number) => {
    const wi = rows[i]?.wi
    if (wi === undefined) return
    onWavesChange(waves.filter((_, j) => j !== wi))
    setSelected(null)
  }
  const setRadix = (i: number, radix: Radix) => {
    const wi = rows[i]?.wi
    onWavesChange(waves.map((w, j) => (j === wi ? { ...w, radix } : w)))
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected !== null) removeRow(selected)
    else if (e.key === 'f' || e.key === 'F') fit()
    else if ((e.key === 'Enter' || e.key === ' ') && selected !== null && rows[selected]?.bit === null && (rows[selected]?.sig?.width ?? 1) > 1)
      toggleExpand(rows[selected].wi)
    else if (e.key === 'i' || e.key === '+' || e.key === '=') zoomAt(0.5)
    else if (e.key === 'o' || e.key === '-') zoomAt(2)
    else if (e.key === 'ArrowUp' && selected !== null) setSelected(Math.max(0, selected - 1))
    else if (e.key === 'ArrowDown' && selected !== null) setSelected(Math.min(rows.length - 1, selected + 1))
    else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && selected !== null && cursors[0] !== null) {
      // jump cursor to next/previous edge of the selected signal (ModelSim "Find next edge")
      const sig = rows[selected]?.sig
      if (!sig) return
      const k = changeIndexAt(sig, cursors[0])
      const target = e.key === 'ArrowRight' ? sig.changes[k + 1] : sig.changes[sig.changes[k]?.t === cursors[0] ? k - 1 : k]
      if (target) setCursors(([, b]) => [target.t, b])
    } else return
    e.preventDefault()
  }

  const addSignals = (sigs: VcdSignal[]) => {
    const have = new Set(waves.map((w) => w.key))
    const add = sigs.filter((s) => !have.has(signalKey(s))).map((s) => ({ key: signalKey(s), radix: defaultRadix(s.width) }))
    if (add.length) onWavesChange([...waves, ...add])
  }

  const menuWave = menu ? waves[rows[menu.index]?.wi ?? -1] : undefined
  const delta = cursors[0] !== null && cursors[1] !== null ? Math.abs(cursors[1] - cursors[0]) : null

  return (
    <div className="wave" tabIndex={0} onKeyDown={onKey} onClick={() => setMenu(null)}>
      <div className="wave-toolbar">
        <button title="Show/hide objects (signals browser)" className={showObjects ? 'on' : ''} onClick={() => setShowObjects((s) => !s)}>
          ☰ Objects
        </button>
        <span className="sep" />
        <button title="Zoom in (I)" onClick={() => zoomAt(0.5)}>＋</button>
        <button title="Zoom out (O)" onClick={() => zoomAt(2)}>－</button>
        <button title="Zoom full (F)" onClick={fit}>⤢ Fit</button>
        <button title="Zoom between cursors" onClick={zoomCursors} disabled={delta === null || delta === 0}>
          ⇔ Cursors
        </button>
        <span className="sep" />
        <span className="cur c1">C1: {cursors[0] !== null ? fmt(cursors[0]) : '—'}</span>
        <span className="cur c2">C2: {cursors[1] !== null ? fmt(cursors[1]) : '—'}</span>
        <span className="cur">Δ: {delta !== null ? fmt(delta) : '—'}</span>
        {delta ? <span className="cur dim">({+(1e15 / (delta * ts) / 1e6).toPrecision(4)} MHz)</span> : null}
        <span className="spacer" />
        <span className="dim">{title}</span>
      </div>
      {!data ? (
        <div className="empty">No waveform loaded. Compile, choose a top-level testbench and press Run — or open a .vcd file.</div>
      ) : (
        <div className="wave-body">
          {showObjects && <Objects data={data} onAdd={addSignals} />}
          <div className="wave-grid">
            <div className="wave-head">
              <div style={{ width: nameW, position: 'relative' }}>
                Signal
                <span className="col-split" title="Drag to resize" onMouseDown={startResize('name')} onDoubleClick={() => setWidths([NAME_W, valueW])} />
              </div>
              <div style={{ width: valueW }}>Value @C1</div>
            </div>
            <div
              className="wave-scroll"
              ref={scrollRef}
              onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
            >
              <div style={{ height: rows.length * ROW_H + ROW_H, display: 'flex' }}>
                <div className="wave-names" style={{ width: nameW }}>
                  {rows.map((r, i) => {
                    const leaf = r.key.split('/').filter(Boolean).pop()!
                    const bus = r.bit === null && !!r.sig && r.sig.width > 1 && r.sig.kind !== 'real'
                    return (
                      <div
                        key={r.key}
                        className={'wave-name' + (i === selected ? ' sel' : '') + (r.sig ? '' : ' missing') + (r.bit !== null ? ' bit' : '')}
                        style={{ height: ROW_H }}
                        title={`${r.key}${r.sig ? ` [${r.sig.width} bit]` : ' (not in waveform)'}`}
                        draggable={r.bit === null}
                        onDragStart={() => (dragIndex.current = r.wi)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          const from = dragIndex.current
                          if (from === null || from === r.wi) return
                          const next = waves.slice()
                          const [m] = next.splice(from, 1)
                          next.splice(r.wi, 0, m)
                          onWavesChange(next)
                          setSelected(null)
                        }}
                        onMouseDown={() => setSelected(i)}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          setSelected(i)
                          setMenu({ x: e.clientX, y: e.clientY, index: i })
                        }}
                      >
                        {bus ? (
                          <span
                            className="expand"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleExpand(r.wi)
                            }}
                            title={r.expanded ? 'Collapse bits' : 'Expand bits'}
                          >
                            {r.expanded ? '−' : '+'}
                          </span>
                        ) : (
                          <span className="expand none" />
                        )}
                        <span className="leaf">{r.bit !== null ? `(${r.bit})` : leaf}</span>
                        {bus && <span className="width">[{r.sig!.width - 1}:0]</span>}
                        {forced?.has(r.key) && <span className="forced" title="driven by force">F</span>}
                      </div>
                    )
                  })}
                </div>
                <div className="wave-values" style={{ width: valueW }}>
                  {rows.map((r, i) => {
                    const v = r.sig && cursors[0] !== null ? valueAt(r.sig, cursors[0]) : undefined
                    const text = v === undefined ? '' : r.sig!.width === 1 || r.sig!.kind === 'real' ? v.toUpperCase() : formatValue(v, r.radix)
                    return (
                      <div key={r.key} className={'wave-value' + (i === selected ? ' sel' : '')} style={{ height: ROW_H }} onMouseDown={() => setSelected(i)} title={text}>
                        {text}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
          <div
            className="wave-split"
            title="Drag to resize the signal list (double-click: default)"
            onMouseDown={startResize('total')}
            onDoubleClick={() => setWidths([NAME_W, VALUE_W])}
          />
          <div className="wave-canvas-col">
            <canvas ref={rulerRef} className="ruler" onMouseDown={onCanvasDown} />
            <div className="wave-area" ref={areaRef} onWheel={onWheel} onContextMenu={(e) => e.preventDefault()}>
              <canvas
                ref={canvasRef}
                onMouseDown={onCanvasDown}
                onWheel={(e) => {
                  if (!(e.ctrlKey || e.metaKey) && Math.abs(e.deltaY) >= Math.abs(e.deltaX) && !e.shiftKey && scrollRef.current) {
                    scrollRef.current.scrollTop += e.deltaY
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}
      {menu && (
        <div className="ctx" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          {onForce && (
            <>
              <div
                className="ctx-item"
                onClick={() => {
                  const r = rows[menu.index]
                  const w = r && waves[r.wi]
                  if (w) onForce(w.key, byKey.get(w.key)?.width ?? 1)
                  setMenu(null)
                }}
              >
                Force…
              </div>
              {forced?.has(menuWave?.key ?? '') && onNoForce && (
                <div
                  className="ctx-item"
                  onClick={() => {
                    onNoForce(menuWave!.key)
                    setMenu(null)
                  }}
                >
                  NoForce
                </div>
              )}
              <div className="ctx-sep" />
            </>
          )}
          <div className="ctx-title">Radix</div>
          {(Object.keys(RADIX_LABEL) as Radix[]).map((rx) => (
            <div
              key={rx}
              className={'ctx-item' + (menuWave?.radix === rx ? ' on' : '')}
              onClick={() => {
                setRadix(menu.index, rx)
                setMenu(null)
              }}
            >
              {RADIX_LABEL[rx]}
            </div>
          ))}
          <div className="ctx-sep" />
          <div
            className="ctx-item"
            onClick={() => {
              const rx = menuWave?.radix
              if (rx) onWavesChange(waves.map((w) => ({ ...w, radix: rx })))
              setMenu(null)
            }}
          >
            Apply radix to all signals
          </div>
          <div
            className="ctx-item danger"
            onClick={() => {
              removeRow(menu.index)
              setMenu(null)
            }}
          >
            Remove from wave (Del)
          </div>
        </div>
      )}
    </div>
  )
}

/** Hierarchy + signal browser (ModelSim's "sim" and "Objects" panes combined). */
function Objects({ data, onAdd }: { data: VcdData; onAdd: (s: VcdSignal[]) => void }) {
  const scopes = useMemo(() => {
    const m = new Map<string, { path: string[]; signals: VcdSignal[] }>()
    for (const s of data.signals) {
      for (let d = 1; d <= s.scope.length; d++) {
        const p = s.scope.slice(0, d)
        const k = p.join('/')
        if (!m.has(k)) m.set(k, { path: p, signals: [] })
      }
      m.get(s.scope.join('/'))?.signals.push(s)
    }
    // keep scopes that (transitively) contain signals
    return [...m.values()]
      .filter((sc) => data.signals.some((s) => s.scope.join('/').startsWith(sc.path.join('/'))))
      .sort((a, b) => a.path.join('/').localeCompare(b.path.join('/')))
  }, [data])
  const [cur, setCur] = useState<string>('')
  const [filter, setFilter] = useState('')
  const current = scopes.find((s) => s.path.join('/') === cur) ?? scopes[0]
  const sigs = (current?.signals ?? []).filter((s) => s.name.toLowerCase().includes(filter.toLowerCase()))
  return (
    <div className="objects">
      <div className="objects-title">Instances</div>
      <div className="objects-tree">
        {scopes.map((sc) => {
          const k = sc.path.join('/')
          return (
            <div
              key={k}
              className={'tree-item' + (current === sc ? ' sel' : '')}
              style={{ paddingLeft: 6 + (sc.path.length - 1) * 12 }}
              onClick={() => setCur(k)}
              onDoubleClick={() => onAdd(data.signals.filter((s) => s.scope.join('/') === k))}
              title="Double-click to add all signals of this instance"
            >
              ▸ {sc.path[sc.path.length - 1]}
            </div>
          )
        })}
      </div>
      <div className="objects-title">
        Objects
        <button className="mini" onClick={() => current && onAdd(sigs)} title="add wave *">
          Add all
        </button>
      </div>
      <input className="objects-filter" placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <div className="objects-list">
        {sigs.map((s) => (
          <div key={signalKey(s)} className="obj" onDoubleClick={() => onAdd([s])} title="Double-click to add to wave">
            <span>{s.name}</span>
            <span className="dim">{s.width > 1 ? `[${s.width - 1}:0]` : ''}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
