/** Widths of the Signal and Value columns, adjustable by dragging and remembered per machine. */
import { useEffect, useState } from 'react'

export const NAME_W = 230
export const VALUE_W = 110
const MIN_NAME_W = 60
const MIN_VALUE_W = 40
const STORAGE_KEY = 'wave.widths'

function load(): [number, number] {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (Array.isArray(v) && v.every((n) => typeof n === 'number')) return [Math.max(MIN_NAME_W, v[0]), Math.max(MIN_VALUE_W, v[1])]
  } catch {
    /* storage unavailable */
  }
  return [NAME_W, VALUE_W]
}

/**
 * New widths after dragging a divider by `d` pixels. 'total' is the line between the signal list
 * and the waves: shrinking takes from the Value column first, then from the names.
 */
export function resizeColumns(which: 'name' | 'total', [n0, v0]: [number, number], d: number): [number, number] {
  if (which === 'name') return [Math.max(MIN_NAME_W, n0 + d), v0]
  const total = Math.max(MIN_NAME_W + MIN_VALUE_W, n0 + v0 + d)
  const v = d >= 0 ? v0 + d : Math.max(MIN_VALUE_W, Math.min(v0, total - n0))
  return [Math.max(MIN_NAME_W, total - v), v]
}

export function useColumnWidths() {
  const [widths, setWidths] = useState<[number, number]>(load)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(widths))
    } catch {
      /* ignore */
    }
  }, [widths])

  /** mousedown handler for a divider */
  const startResize = (which: 'name' | 'total') => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const x0 = e.clientX
    const start = widths
    const move = (ev: MouseEvent) => setWidths(resizeColumns(which, start, ev.clientX - x0))
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      document.body.classList.remove('col-resizing')
    }
    document.body.classList.add('col-resizing')
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  return { nameW: widths[0], valueW: widths[1], setWidths, startResize }
}
