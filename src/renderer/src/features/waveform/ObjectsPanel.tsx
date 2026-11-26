/** Hierarchy + signal browser (ModelSim's "sim" and "Objects" panes combined). */
import { useMemo, useState } from 'react'
import type { VcdData, VcdSignal } from '@shared/waveform/vcd'
import { buildScopes, scopeKey } from './scopes'
import { signalKey } from './waveItems'

interface Props {
  data: VcdData
  onAdd: (signals: VcdSignal[]) => void
}

export default function ObjectsPanel({ data, onAdd }: Props) {
  const scopes = useMemo(() => buildScopes(data), [data])
  const [cur, setCur] = useState('')
  const [filter, setFilter] = useState('')
  const current = scopes.find((s) => scopeKey(s.path) === cur) ?? scopes[0]
  const sigs = (current?.signals ?? []).filter((s) => s.name.toLowerCase().includes(filter.toLowerCase()))
  return (
    <div className="objects">
      <div className="objects-title">Instances</div>
      <div className="objects-tree">
        {scopes.map((sc) => {
          const k = scopeKey(sc.path)
          return (
            <div
              key={k}
              className={'tree-item' + (current === sc ? ' sel' : '')}
              style={{ paddingLeft: 6 + (sc.path.length - 1) * 12 }}
              onClick={() => setCur(k)}
              onDoubleClick={() => onAdd(data.signals.filter((s) => scopeKey(s.scope) === k))}
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
