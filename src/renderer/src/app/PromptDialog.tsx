/** Small modal with one text field (Electron has no window.prompt). */
import type { ReactNode } from 'react'

export interface Prompt {
  title: ReactNode
  value: string
  ok: string
  onOk: (value: string) => void
}

interface Props {
  prompt: Prompt
  onChange: (p: Prompt) => void
  onClose: () => void
}

export default function PromptDialog({ prompt, onChange, onClose }: Props) {
  return (
    <div className="modal-back" onMouseDown={onClose}>
      <form
        className="modal"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          onClose()
          prompt.onOk(prompt.value)
        }}
      >
        <div>{prompt.title}</div>
        <input
          autoFocus
          value={prompt.value}
          onFocus={(e) => {
            // select the name without the extension, like Finder
            const dot = e.target.value.lastIndexOf('.')
            e.target.setSelectionRange(0, dot > 0 ? dot : e.target.value.length)
          }}
          onChange={(e) => onChange({ ...prompt, value: e.target.value })}
          onKeyDown={(e) => e.key === 'Escape' && onClose()}
        />
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary">
            {prompt.ok}
          </button>
        </div>
      </form>
    </div>
  )
}
