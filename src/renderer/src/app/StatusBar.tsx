/** Bottom status bar: activity, diagnostics count, top, standard and GHDL version. */
import type { GhdlStatus } from '@shared/contract'
import type { Diagnostic, Std } from '@shared/project'

interface Props {
  busy: string | null
  diagnostics: Diagnostic[]
  top: string
  std: Std
  ghdl: Pick<GhdlStatus, 'path' | 'version'>
}

export default function StatusBar({ busy, diagnostics, top, std, ghdl }: Props) {
  const errors = diagnostics.filter((d) => d.severity === 'error').length
  return (
    <footer className="statusbar">
      <span>{busy ?? 'Ready'}</span>
      <span className="spacer" />
      {diagnostics.length > 0 && (
        <span className={errors ? 'err' : 'warn'}>
          Errors: {errors} · Warnings: {diagnostics.length - errors}
        </span>
      )}
      <span>Top: {top || '—'}</span>
      <span>{std === '08' ? 'VHDL-2008' : 'VHDL-93'}</span>
      <span className={ghdl.path ? '' : 'err'} title={ghdl.path ?? ''}>
        {ghdl.path ? ghdl.version ?? 'GHDL' : 'GHDL not found'}
      </span>
    </footer>
  )
}
