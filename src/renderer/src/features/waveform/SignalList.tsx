/** Left part of the wave window: signal names (with +/− for buses) and their value at cursor C1. */
import { useRef } from 'react'
import { formatValue } from '@shared/waveform/radix'
import { valueAt } from '@shared/waveform/vcd'
import { ROW_H } from './draw'
import { isBus, type Row } from './waveItems'

interface Props {
  rows: Row[]
  nameW: number
  valueW: number
  selected: number | null
  cursor: number | null
  forced?: Set<string>
  onSelect: (row: number) => void
  onMenu: (row: number, x: number, y: number) => void
  onToggleExpand: (wi: number) => void
  /** drag & drop of an item from index `from` to index `to` */
  onMove: (from: number, to: number) => void
}

export default function SignalList({ rows, nameW, valueW, selected, cursor, forced, onSelect, onMenu, onToggleExpand, onMove }: Props) {
  const dragFrom = useRef<number | null>(null)
  return (
    <div style={{ height: rows.length * ROW_H + ROW_H, display: 'flex' }}>
      <div className="wave-names" style={{ width: nameW }}>
        {rows.map((r, i) => {
          const leaf = r.key.split('/').filter(Boolean).pop()!
          const bus = r.bit === null && isBus(r.sig)
          return (
            <div
              key={r.key}
              className={'wave-name' + (i === selected ? ' sel' : '') + (r.sig ? '' : ' missing') + (r.bit !== null ? ' bit' : '')}
              style={{ height: ROW_H }}
              title={`${r.key}${r.sig ? ` [${r.sig.width} bit]` : ' (not in waveform)'}`}
              draggable={r.bit === null}
              onDragStart={() => (dragFrom.current = r.wi)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragFrom.current !== null && dragFrom.current !== r.wi) onMove(dragFrom.current, r.wi)
              }}
              onMouseDown={() => onSelect(i)}
              onContextMenu={(e) => {
                e.preventDefault()
                onMenu(i, e.clientX, e.clientY)
              }}
            >
              {bus ? (
                <span
                  className="expand"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleExpand(r.wi)
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
          const v = r.sig && cursor !== null ? valueAt(r.sig, cursor) : undefined
          const text = v === undefined ? '' : r.sig!.width === 1 || r.sig!.kind === 'real' ? v.toUpperCase() : formatValue(v, r.radix)
          return (
            <div key={r.key} className={'wave-value' + (i === selected ? ' sel' : '')} style={{ height: ROW_H }} onMouseDown={() => onSelect(i)} title={text}>
              {text}
            </div>
          )
        })}
      </div>
    </div>
  )
}
