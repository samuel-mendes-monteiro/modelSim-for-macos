/**
 * Per-project, per-top session saved in <project>/.vhdlsim/session-<top>.json:
 * the wave signal list (with radix and expansion) and the active forces.
 */
import type { ForceCmd } from '@shared/simulation/force'
import type { WaveItem } from '../waveform/waveItems'

/** Bump when the meaning of saved data changes; older wave lists are then ignored. */
export const SESSION_VERSION = 2

export interface Session {
  waves: WaveItem[]
  forces: ForceCmd[]
}

export const sessionPath = (dir: string, top: string) => `${dir}/.vhdlsim/session-${top}.json`

export function serializeSession(s: Session): string {
  return JSON.stringify({ v: SESSION_VERSION, ...s }, null, 1)
}

/** Parse a saved session; unknown or outdated parts come back as null. */
export function parseSession(text: string): { waves: WaveItem[] | null; forces: ForceCmd[] | null } {
  try {
    const s = JSON.parse(text) as Partial<Session> & { v?: number }
    return {
      // v1 stored the old hex default for every bus: let the new defaults apply
      waves: Array.isArray(s.waves) && s.v === SESSION_VERSION ? s.waves : null,
      forces: Array.isArray(s.forces) ? s.forces : null
    }
  } catch {
    return { waves: null, forces: null }
  }
}
