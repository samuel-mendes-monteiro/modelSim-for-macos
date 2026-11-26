import { useEffect, useRef, useState } from 'react'
import type { LogKind } from '@shared/contract'

export interface LogLine {
  id: number
  kind: LogKind
  text: string
}

interface Props {
  lines: LogLine[]
  prompt: string
  onCommand: (cmd: string) => void
  onJump: (file: string, line: number, col: number) => void
}

const LOC_RE = /^(.+?\.vhdl?):(\d+):(\d+)/i

export default function Transcript({ lines, prompt, onCommand, onJump }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [input, setInput] = useState('')
  const [hist, setHist] = useState<string[]>([])
  const [hi, setHi] = useState(-1)
  const stick = useRef(true)

  useEffect(() => {
    const el = ref.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [lines])

  return (
    <div className="transcript">
      <div className="panel-title">Transcript</div>
      <div
        className="transcript-body"
        ref={ref}
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 20
        }}
      >
        {lines.map((l) => {
          const m = l.text.match(LOC_RE)
          return (
            <div
              key={l.id}
              className={'tl ' + l.kind + (m ? ' link' : '')}
              onClick={m ? () => onJump(m[1], Number(m[2]), Number(m[3])) : undefined}
              title={m ? 'Click to open at this line' : undefined}
            >
              {l.kind === 'cmd' ? `${prompt} ${l.text}` : l.kind === 'out' || l.kind === 'info' ? `# ${l.text}` : `# ${l.text}`}
            </div>
          )
        })}
      </div>
      <form
        className="transcript-input"
        onSubmit={(e) => {
          e.preventDefault()
          const c = input.trim()
          if (!c) return
          setHist((h) => [...h, c])
          setHi(-1)
          setInput('')
          onCommand(c)
        }}
      >
        <span className="prompt">{prompt}</span>
        <input
          value={input}
          spellCheck={false}
          placeholder="help · vcom · vsim <top> · run 100 ns · run -all · restart · add wave * · clear"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' && hist.length) {
              const n = hi < 0 ? hist.length - 1 : Math.max(0, hi - 1)
              setHi(n)
              setInput(hist[n])
              e.preventDefault()
            } else if (e.key === 'ArrowDown' && hi >= 0) {
              const n = hi + 1
              if (n >= hist.length) {
                setHi(-1)
                setInput('')
              } else {
                setHi(n)
                setInput(hist[n])
              }
              e.preventDefault()
            }
          }}
        />
      </form>
    </div>
  )
}
