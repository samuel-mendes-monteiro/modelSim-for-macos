/**
 * Wave window: toolbar, Objects panel, signal list and the canvas with ruler and cursors.
 * State that must survive a new simulation (the signal list) is owned by the caller via
 * `waves` / `onWavesChange`; view state (zoom, cursors, selection) lives here.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { formatTime } from '@shared/waveform/time'
import type { VcdData, VcdSignal } from '@shared/waveform/vcd'
import { drawWaves, ROW_H } from './draw'
import ObjectsPanel from './ObjectsPanel'
import SignalList from './SignalList'
import { displayEnd, edgeFrom, fitView, snapToEdge, viewBetween, zoomView, type View } from './timeAxis'
import { NAME_W, VALUE_W, useColumnWidths } from './useColumnWidths'
import WaveContextMenu from './WaveContextMenu'
import * as items from './waveItems'
import type { WaveItem } from './waveItems'

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
  const [menu, setMenu] = useState<{ x: number; y: number; row: number } | null>(null)
  const [showObjects, setShowObjects] = useState(true)
  const { nameW, valueW, setWidths, startResize } = useColumnWidths()

  const byKey = useMemo(() => items.indexSignals(data), [data])
  const rows = useMemo(() => items.buildRows(waves, byKey), [waves, byKey])
  const ts = data?.timescaleFs ?? 1
  const end = displayEnd(data)
  const fmt = useCallback((t: number) => formatTime(t * ts), [ts])

  const fit = useCallback(() => setView(fitView(end, size.w)), [end, size.w])
  const zoomAt = useCallback((factor: number, x?: number) => setView((v) => zoomView(v, factor, x ?? size.w / 2, end)), [size.w, end])

  // fit when a run produced a different length; drop cursors beyond the new end
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

  // ---------- drawing ----------
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (!canvasRef.current || !rulerRef.current) return
      drawWaves({
        wave: canvasRef.current,
        ruler: rulerRef.current,
        width: size.w,
        height: size.h,
        view,
        rows,
        scrollTop,
        selected,
        cursors,
        end,
        timescaleFs: ts
      })
    })
    return () => cancelAnimationFrame(id)
  }, [size, view, rows, scrollTop, cursors, selected, end, ts])

  // ---------- mouse ----------
  const timeAtX = (x: number) => Math.max(0, Math.min(end, view.start + x * view.scale))
  const snap = (t: number, row: number | null) => snapToEdge(t, row !== null ? rows[row]?.sig : undefined, view.scale)

  const onCanvasDown = (e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    const x = e.clientX - rect.left
    const rowIdx = Math.floor((e.clientY - rect.top + scrollTop) / ROW_H)
    const onRuler = e.target === rulerRef.current
    const row = !onRuler && rowIdx >= 0 && rowIdx < rows.length ? rowIdx : null
    if (row !== null) setSelected(row)
    const t = snap(timeAtX(x), row)
    if (e.shiftKey || e.button === 2) setCursors(([a]) => [a, t])
    else setCursors(([, b]) => [t, b])
    if (e.button === 0 && !e.shiftKey) {
      // drag C1
      const move = (ev: MouseEvent) => setCursors(([, b]) => [snap(timeAtX(ev.clientX - rect.left), row), b])
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

  // ---------- keyboard ----------
  const removeRow = (row: number) => {
    const wi = rows[row]?.wi
    if (wi === undefined) return
    onWavesChange(items.removeItem(waves, wi))
    setSelected(null)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return
    const sel = selected !== null ? rows[selected] : undefined
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected !== null) removeRow(selected)
    else if (e.key === 'f' || e.key === 'F') fit()
    else if ((e.key === 'Enter' || e.key === ' ') && sel && sel.bit === null && (sel.sig?.width ?? 1) > 1) onWavesChange(items.toggleExpand(waves, sel.wi))
    else if (e.key === 'i' || e.key === '+' || e.key === '=') zoomAt(0.5)
    else if (e.key === 'o' || e.key === '-') zoomAt(2)
    else if (e.key === 'ArrowUp' && selected !== null) setSelected(Math.max(0, selected - 1))
    else if (e.key === 'ArrowDown' && selected !== null) setSelected(Math.min(rows.length - 1, selected + 1))
    else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && sel && cursors[0] !== null) {
      if (!sel.sig) return
      const t = edgeFrom(sel.sig, cursors[0], e.key === 'ArrowRight' ? 1 : -1)
      if (t !== null) setCursors(([, b]) => [t, b])
    } else return
    e.preventDefault()
  }

  const addSignals = (sigs: VcdSignal[]) => {
    const next = items.addSignals(waves, sigs)
    if (next !== waves) onWavesChange(next)
  }

  const menuItem = menu ? waves[rows[menu.row]?.wi ?? -1] : undefined
  const menuWi = menu ? rows[menu.row]?.wi : undefined
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
        <button
          title="Zoom between cursors"
          onClick={() => cursors[0] !== null && cursors[1] !== null && delta && setView(viewBetween(cursors[0], cursors[1], size.w))}
          disabled={!delta}
        >
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
          {showObjects && <ObjectsPanel data={data} onAdd={addSignals} />}
          <div className="wave-grid">
            <div className="wave-head">
              <div style={{ width: nameW, position: 'relative' }}>
                Signal
                <span className="col-split" title="Drag to resize" onMouseDown={startResize('name')} onDoubleClick={() => setWidths([NAME_W, valueW])} />
              </div>
              <div style={{ width: valueW }}>Value @C1</div>
            </div>
            <div className="wave-scroll" ref={scrollRef} onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}>
              <SignalList
                rows={rows}
                nameW={nameW}
                valueW={valueW}
                selected={selected}
                cursor={cursors[0]}
                forced={forced}
                onSelect={setSelected}
                onMenu={(row, x, y) => {
                  setSelected(row)
                  setMenu({ x, y, row })
                }}
                onToggleExpand={(wi) => onWavesChange(items.toggleExpand(waves, wi))}
                onMove={(from, to) => {
                  onWavesChange(items.moveItem(waves, from, to))
                  setSelected(null)
                }}
              />
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
      {menu && menuItem && menuWi !== undefined && (
        <WaveContextMenu
          x={menu.x}
          y={menu.y}
          radix={menuItem.radix}
          forced={!!forced?.has(menuItem.key)}
          onForce={onForce && (() => onForce(menuItem.key, byKey.get(menuItem.key)?.width ?? 1))}
          onNoForce={onNoForce && (() => onNoForce(menuItem.key))}
          onRadix={(rx) => onWavesChange(items.setRadix(waves, menuWi, rx))}
          onRadixAll={() => onWavesChange(items.setRadixAll(waves, menuItem.radix))}
          onRemove={() => removeRow(menu.row)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}
