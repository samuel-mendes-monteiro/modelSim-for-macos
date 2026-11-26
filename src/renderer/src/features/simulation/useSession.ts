/** Loads the session when the project or top changes and saves it (debounced) on every change. */
import { useEffect, useRef, useState } from 'react'
import type { ForceCmd } from '@shared/simulation/force'
import { api } from '../../services/api'
import type { Log } from '../transcript/useTranscript'
import type { WaveItem } from '../waveform/waveItems'
import { parseSession, serializeSession, sessionPath } from './session'

const SAVE_DELAY_MS = 400

export function useSession(dir: string | null, top: string, log: Log) {
  const [waves, setWaves] = useState<WaveItem[]>([])
  const [forces, setForces] = useState<ForceCmd[]>([])
  // saving starts only after the session of this dir/top was loaded (or found missing)
  const loadedFor = useRef<string | null>(null)

  useEffect(() => {
    loadedFor.current = null
    setForces([])
    if (!dir || !top) return
    const key = `${dir}|${top}`
    api
      .readFile(sessionPath(dir, top))
      .then((text) => {
        const s = parseSession(text)
        if (s.waves) setWaves(s.waves)
        if (s.forces) {
          setForces(s.forces)
          if (s.forces.length) log('info', `Restored ${s.forces.length} force command(s) for ${top} (type "force" to list, "noforce *" to clear).`)
        }
      })
      .catch(() => {})
      .finally(() => {
        loadedFor.current = key
      })
  }, [dir, top, log])

  useEffect(() => {
    if (!dir || !top || loadedFor.current !== `${dir}|${top}`) return
    const t = setTimeout(() => {
      api.writeFile(sessionPath(dir, top), serializeSession({ waves, forces })).catch(() => {})
    }, SAVE_DELAY_MS)
    return () => clearTimeout(t)
  }, [dir, top, waves, forces])

  return { waves, setWaves, forces, setForces }
}
