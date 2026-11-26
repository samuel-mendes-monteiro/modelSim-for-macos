/** Simulation time: all times in the app are integers in femtoseconds. */

const UNITS: [string, number][] = [
  ['s', 1e15],
  ['ms', 1e12],
  ['us', 1e9],
  ['ns', 1e6],
  ['ps', 1e3],
  ['fs', 1]
]

/** Format a time given in femtoseconds. */
export function formatTime(fs: number): string {
  if (fs === 0) return '0 ns'
  const a = Math.abs(fs)
  for (const [u, f] of UNITS) {
    if (a >= f) return `${+(fs / f).toFixed(3)} ${u}`
  }
  return `${fs} fs`
}

/** Parse "100 ns", "1.5us", "20" (default ns) → femtoseconds; null if invalid. */
export function parseTime(s: string): number | null {
  const m = s.trim().match(/^(\d+(?:\.\d+)?)\s*(fs|ps|ns|us|ms|sec|s)?$/i)
  if (!m) return null
  const unit = (m[2] ?? "ns").toLowerCase().replace("sec", "s")
  const f = UNITS.find(([u]) => u === unit)![1]
  return Math.round(Number(m[1]) * f)
}
