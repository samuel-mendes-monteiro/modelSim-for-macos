/** Right-click menu of a wave signal: force, radix, remove. */
import { Fragment } from 'react'
import { RADIX_LABEL, type Radix } from '@shared/waveform/radix'

interface Props {
  x: number
  y: number
  radix: Radix | undefined
  forced: boolean
  /** absent when forcing is not available (e.g. an external .vcd) */
  onForce?: () => void
  onNoForce?: () => void
  onRadix: (r: Radix) => void
  onRadixAll: () => void
  onRemove: () => void
  onClose: () => void
}

export default function WaveContextMenu(p: Props) {
  const item = (label: string, action: () => void, className = '') => (
    <div
      className={'ctx-item ' + className}
      onClick={() => {
        action()
        p.onClose()
      }}
    >
      {label}
    </div>
  )
  return (
    <div className="ctx" style={{ left: p.x, top: p.y }} onClick={(e) => e.stopPropagation()}>
      {p.onForce && (
        <>
          {item('Force…', p.onForce)}
          {p.forced && p.onNoForce && item('NoForce', p.onNoForce)}
          <div className="ctx-sep" />
        </>
      )}
      <div className="ctx-title">Radix</div>
      {(Object.keys(RADIX_LABEL) as Radix[]).map((rx) => (
        <Fragment key={rx}>{item(RADIX_LABEL[rx], () => p.onRadix(rx), p.radix === rx ? 'on' : '')}</Fragment>
      ))}
      <div className="ctx-sep" />
      {item('Apply radix to all signals', p.onRadixAll)}
      {item('Remove from wave (Del)', p.onRemove, 'danger')}
    </div>
  )
}
