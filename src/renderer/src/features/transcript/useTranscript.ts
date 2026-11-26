/** Transcript lines: everything logged by the interface and pushed by the main process. */
import { useCallback, useEffect, useState } from 'react'
import type { LogKind } from '@shared/contract'
import { api } from '../../services/api'
import type { LogLine } from './Transcript'

const MAX_LINES = 5000
let nextId = 0

export type Log = (kind: LogKind, text: string) => void

export function useTranscript() {
  const [lines, setLines] = useState<LogLine[]>([])

  const log: Log = useCallback((kind, text) => {
    setLines((l) => {
      const next = l.length > MAX_LINES ? l.slice(-MAX_LINES) : l.slice()
      next.push({ id: ++nextId, kind, text })
      return next
    })
  }, [])

  // GHDL output streamed from the main process
  useEffect(() => api.onLog(log), [log])

  const clear = useCallback(() => setLines([]), [])
  return { lines, log, clear }
}
