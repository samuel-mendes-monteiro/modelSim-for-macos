/** Top toolbar: project, compile and simulation controls. */
import type { EntityInfo, Std } from '@shared/project'
import { formatTime } from '@shared/waveform/time'

interface Props {
  hasProject: boolean
  canSave: boolean
  busy: boolean
  std: Std
  top: string
  entities: EntityInfo[]
  runLength: string
  simTime: number
  onOpenFolder: () => void
  onOpenFile: () => void
  onNewFile: () => void
  onSave: () => void
  onCompile: () => void
  onStd: (s: Std) => void
  onTop: (name: string) => void
  onRunLength: (v: string) => void
  onRun: () => void
  onRunAll: () => void
  onBreak: () => void
  onRestart: () => void
  onOpenVcd: () => void
}

export default function Toolbar(p: Props) {
  return (
    <header className="toolbar">
      <button onClick={p.onOpenFolder} title="Open project folder (⌘O)">📂 Open Folder</button>
      <button onClick={p.onOpenFile} title="Add .vhd/.vhdl files to this project — files from other folders are copied in (⌥⌘O)">📝 Open File</button>
      <button onClick={p.onNewFile} disabled={!p.hasProject} title="New VHDL file (⌘N)">📄 New</button>
      <button onClick={p.onSave} disabled={!p.canSave} title="Save (⌘S)">💾 Save</button>
      <span className="sep" />
      <button onClick={p.onCompile} disabled={!p.hasProject || p.busy} title="Compile all (⌘B)">⚙︎ Compile All</button>
      <select value={p.std} onChange={(e) => p.onStd(e.target.value as Std)} title="VHDL standard">
        <option value="08">VHDL-2008</option>
        <option value="93c">VHDL-93</option>
      </select>
      <span className="sep" />
      <label className="lbl">Top</label>
      <select value={p.top} onChange={(e) => p.onTop(e.target.value)} title="Top-level entity / testbench">
        {!p.entities.length && <option value="">—</option>}
        {p.entities.map((e) => (
          <option key={e.name} value={e.name}>
            {e.name}
            {e.top ? ' (top)' : ''}
          </option>
        ))}
      </select>
      <input className="runlen" value={p.runLength} onChange={(e) => p.onRunLength(e.target.value)} title="Run length" onKeyDown={(e) => e.key === 'Enter' && p.onRun()} />
      <button onClick={p.onRun} disabled={!p.hasProject || p.busy} title="Run (F9)">▶ Run</button>
      <button onClick={p.onRunAll} disabled={!p.hasProject || p.busy} title="Run -All (⇧F9)">⏩ Run -All</button>
      <button onClick={p.onBreak} disabled={!p.busy} title="Break (⌘.)">⏹ Break</button>
      <button onClick={p.onRestart} disabled={!p.hasProject} title="Restart (⌘R)">⟲ Restart</button>
      <span className="sep" />
      <button onClick={p.onOpenVcd} title="Open a .vcd waveform file (⇧⌘O)">〰 Open VCD</button>
      <span className="spacer" />
      <span className="now">Now: {formatTime(p.simTime)}</span>
    </header>
  )
}
