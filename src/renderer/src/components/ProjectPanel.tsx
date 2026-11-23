import type { ProjectFile } from '@shared/api'

export type FileStatus = 'ok' | 'error' | 'warning' | 'none'

interface Props {
  dir: string | null
  files: ProjectFile[]
  status: Record<string, FileStatus>
  active: string | null
  dirty: Set<string>
  onOpen: (path: string) => void
  onContextMenu: (f: ProjectFile) => void
  onOpenFolder: () => void
  onNewProject: () => void
  onOpenFile: () => void
  onNewFile: () => void
  onRefresh: () => void
}

const ICON: Record<FileStatus, string> = { ok: '✓', error: '✗', warning: '!', none: '?' }
const GROUPS: { kind: ProjectFile['kind']; label: string }[] = [
  { kind: 'package', label: 'Packages' },
  { kind: 'design', label: 'Design' },
  { kind: 'testbench', label: 'Testbenches' }
]

export default function ProjectPanel({ dir, files, status, active, dirty, onOpen, onContextMenu, onOpenFolder, onNewProject, onOpenFile, onNewFile, onRefresh }: Props) {
  if (!dir) {
    return (
      <div className="project empty-project">
        <p>No project open.</p>
        <button className="primary" onClick={onNewProject}>New Project…</button>
        <button onClick={onOpenFolder}>Open Project Folder…</button>
        <button onClick={onOpenFile}>Open VHDL File…</button>
      </div>
    )
  }
  return (
    <div className="project">
      <div className="panel-title">
        <span title={dir}>Project: {dir.split('/').pop()}</span>
        <span className="spacer" />
        <button className="mini" onClick={onNewFile} title="New VHDL file">＋</button>
        <button className="mini" onClick={onRefresh} title="Refresh file list">⟳</button>
      </div>
      <div className="project-cols">
        <span>Name</span>
        <span>Status</span>
      </div>
      {files.length === 0 && <div className="dim pad">No .vhd / .vhdl files in this folder.</div>}
      {GROUPS.map(({ kind, label }) => {
        const list = files.filter((f) => f.kind === kind)
        if (!list.length) return null
        return (
          <div key={kind}>
            <div className="group">{label}</div>
            {list.map((f) => {
              const st = status[f.path] ?? 'none'
              return (
                <div
                  key={f.path}
                  className={'file' + (f.path === active ? ' sel' : '')}
                  onClick={() => onOpen(f.path)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    onContextMenu(f)
                  }}
                  title={`${f.rel}\nEntities: ${f.entities.map((e) => e.name).join(', ') || '—'}`}
                >
                  <span className={'badge ' + kind}>{kind === 'testbench' ? 'TB' : kind === 'package' ? 'PKG' : 'VHD'}</span>
                  <span className="fname">
                    {f.rel}
                    {dirty.has(f.path) ? ' •' : ''}
                  </span>
                  <span className={'st ' + st}>{ICON[st]}</span>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
