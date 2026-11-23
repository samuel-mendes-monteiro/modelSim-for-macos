import { parseTime, formatTime } from './radix'

/**
 * One ModelSim-style `force` command. Times are femtoseconds; `start` is the simulation time at
 * which the command was issued, pair times are relative to it (like ModelSim).
 */
export interface ForceCmd {
  signal: string
  start: number
  pairs: { v: string; t: number }[]
  repeat?: number
}

const DEFAULT_UNIT = 'ns'

/** Parse a time token list like ["50", "ns"] / ["50ns"] / ["50"] (default ns). */
function takeTime(tokens: string[]): number | null {
  const s = tokens.join(' ')
  const withUnit = /[a-z]\s*$/i.test(s) ? s : `${s} ${DEFAULT_UNIT}`
  return parseTime(withUnit)
}

/**
 * Parse the arguments of `force` (everything after the command name):
 *   force [-freeze|-deposit|-drive] <signal> <value> [<time>][, <value> <time>]... [-repeat|-r <period>]
 * `{50 ns}` braces are accepted. Returns an error message string when invalid.
 */
export function parseForce(args: string, now: number): ForceCmd | string {
  let s = args.replace(/[{}]/g, ' ').trim()
  let repeat: number | undefined
  const rep = s.match(/\s-(?:repeat|r)\s+(.+?)(?=\s-\w|$)/i)
  if (rep) {
    const t = takeTime(rep[1].trim().split(/\s+/))
    if (!t) return `Invalid repeat period "${rep[1].trim()}".`
    repeat = t
    s = s.replace(rep[0], ' ')
  }
  if (/\s-cancel\b/i.test(' ' + s)) return '-cancel is not supported (use "noforce <signal>").'
  s = s.replace(/(^|\s)-(freeze|deposit|drive)\b/gi, ' ').trim()

  const segs = s.split(',').map((x) => x.trim().split(/\s+/).filter(Boolean))
  if (!segs[0] || segs[0].length < 2) return 'Usage: force <signal> <value> [<time>][, <value> <time>]... [-repeat <period>]'
  const signal = segs[0][0].replace(/^sim:/i, '').split('/').filter(Boolean).pop()!.toLowerCase()
  const pairs: ForceCmd['pairs'] = []
  for (let i = 0; i < segs.length; i++) {
    const seg = i === 0 ? segs[0].slice(1) : segs[i]
    if (!seg.length) return 'Empty value in force command.'
    const v = seg[0]
    let t = 0
    if (seg.length > 1) {
      const tt = takeTime(seg.slice(1))
      if (tt === null) return `Invalid time "${seg.slice(1).join(' ')}".`
      t = tt
    } else if (i > 0) return `Missing time for value ${v}.`
    if (pairs.length && t <= pairs[pairs.length - 1].t) return 'Force times must increase.'
    pairs.push({ v, t })
  }
  if (repeat !== undefined && repeat <= pairs[pairs.length - 1].t) return 'Repeat period must be larger than the last time.'
  return { signal, start: now, pairs, repeat }
}

export function describeForce(f: ForceCmd): string {
  const body = f.pairs.map((p, i) => (i === 0 && p.t === 0 ? p.v : `${p.v} {${formatTime(p.t)}}`)).join(', ')
  return `force ${f.signal} ${body}${f.repeat ? ` -repeat {${formatTime(f.repeat)}}` : ''}${f.start ? `   (from ${formatTime(f.start)})` : ''}`
}
