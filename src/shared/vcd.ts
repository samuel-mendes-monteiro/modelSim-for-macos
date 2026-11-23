/** Minimal, fast VCD (Value Change Dump) parser. Times are kept in timescale units (`timescaleFs` converts to fs). */

export interface Change {
  t: number
  v: string
}

export interface VcdSignal {
  id: string
  name: string
  scope: string[]
  width: number
  kind: string
  changes: Change[]
}

export interface VcdData {
  timescaleFs: number
  endTime: number
  signals: VcdSignal[]
}

const UNIT_FS: Record<string, number> = { s: 1e15, ms: 1e12, us: 1e9, ns: 1e6, ps: 1e3, fs: 1 }

/** VCD rule: a shorter vector value is left-extended with 0, or with x/z when its MSB is x/z. */
function extend(v: string, width: number): string {
  if (v.length >= width) return v
  const c = v[0] === 'x' || v[0] === 'X' || v[0] === 'z' || v[0] === 'Z' ? v[0] : v[0] === 'U' ? 'U' : '0'
  return c.repeat(width - v.length) + v
}

export function parseVcd(text: string): VcdData {
  const signals: VcdSignal[] = []
  const byId = new Map<string, Change[]>()
  const widthById = new Map<string, number>()
  const scope: string[] = []
  let timescaleFs = 1
  let time = 0
  let endTime = 0

  const toks = text.split(/\s+/)
  let i = 0
  // Header
  while (i < toks.length) {
    const tk = toks[i++]
    if (!tk) continue
    if (tk === '$enddefinitions') {
      while (i < toks.length && toks[i] !== '$end') i++
      i++
      break
    } else if (tk === '$timescale') {
      const parts: string[] = []
      while (i < toks.length && toks[i] !== '$end') parts.push(toks[i++])
      i++
      const m = parts.join('').match(/^(\d+)\s*([a-z]+)$/)
      if (m) timescaleFs = Number(m[1]) * (UNIT_FS[m[2]] ?? 1)
    } else if (tk === '$scope') {
      scope.push(toks[i + 1])
      while (i < toks.length && toks[i] !== '$end') i++
      i++
    } else if (tk === '$upscope') {
      scope.pop()
      while (i < toks.length && toks[i] !== '$end') i++
      i++
    } else if (tk === '$var') {
      const kind = toks[i]
      const width = Number(toks[i + 1]) || 1
      const id = toks[i + 2]
      let name = toks[i + 3]
      i += 4
      // optional bit-select token, e.g. "[7:0]" separated by a space
      while (i < toks.length && toks[i] !== '$end') i++
      i++
      name = name.replace(/\[[^\]]*\]$/, '')
      let changes = byId.get(id)
      if (!changes) {
        changes = []
        byId.set(id, changes)
        widthById.set(id, width)
      }
      signals.push({ id, name, scope: scope.slice(), width, kind, changes })
    } else if (tk.startsWith('$')) {
      // $date, $version, $comment ... skip to $end
      while (i < toks.length && toks[i] !== '$end') i++
      i++
    }
  }

  // Value changes
  while (i < toks.length) {
    const tk = toks[i++]
    if (!tk) continue
    const c = tk[0]
    if (c === '#') {
      time = Number(tk.slice(1))
      if (time > endTime) endTime = time
    } else if (c === 'b' || c === 'B' || c === 'r' || c === 'R') {
      const id = toks[i++]
      const ch = byId.get(id)
      if (!ch) continue
      const raw = tk.slice(1)
      const v = c === 'r' || c === 'R' ? raw : extend(raw, widthById.get(id) ?? raw.length)
      push(ch, time, v)
    } else if (c === '$') {
      // $dumpvars / $dumpall / $end etc. – the values inside are ordinary changes
      continue
    } else {
      const ch = byId.get(tk.slice(1))
      if (ch) push(ch, time, c)
    }
  }
  return { timescaleFs, endTime, signals }
}

function push(ch: Change[], t: number, v: string) {
  const last = ch[ch.length - 1]
  if (last && last.t === t) last.v = v
  else if (!last || last.v !== v) ch.push({ t, v })
}

/** Binary search: index of last change with t <= time, or -1. */
export function changeIndexAt(sig: VcdSignal, time: number): number {
  const ch = sig.changes
  let lo = 0
  let hi = ch.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (ch[mid].t <= time) {
      ans = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return ans
}

export function valueAt(sig: VcdSignal, time: number): string | undefined {
  const k = changeIndexAt(sig, time)
  return k < 0 ? undefined : sig.changes[k].v
}
