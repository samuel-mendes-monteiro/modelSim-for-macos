/** Instance tree of a waveform, for the Objects panel. */
import type { VcdData, VcdSignal } from '@shared/waveform/vcd'

export interface Scope {
  path: string[]
  /** signals declared directly in this scope */
  signals: VcdSignal[]
}

export const scopeKey = (path: string[]) => path.join('/')

/** All scopes that (transitively) contain signals, sorted by path. */
export function buildScopes(data: VcdData): Scope[] {
  const m = new Map<string, Scope>()
  for (const s of data.signals) {
    for (let d = 1; d <= s.scope.length; d++) {
      const p = s.scope.slice(0, d)
      if (!m.has(scopeKey(p))) m.set(scopeKey(p), { path: p, signals: [] })
    }
    m.get(scopeKey(s.scope))?.signals.push(s)
  }
  return [...m.values()]
    .filter((sc) => data.signals.some((s) => scopeKey(s.scope).startsWith(scopeKey(sc.path))))
    .sort((a, b) => scopeKey(a.path).localeCompare(scopeKey(b.path)))
}
