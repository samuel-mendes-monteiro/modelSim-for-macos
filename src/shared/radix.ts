export type Radix = 'bin' | 'hex' | 'unsigned' | 'signed'

export const RADIX_LABEL: Record<Radix, string> = {
  bin: 'Binary',
  hex: 'Hexadecimal',
  unsigned: 'Unsigned',
  signed: 'Signed (decimal)'
}

function metavalue(bits: string): string | null {
  if (/^[01HL]*$/i.test(bits)) return null
  const u = bits.toUpperCase()
  if (/^U+$/.test(u)) return 'U'
  if (/^Z+$/.test(u)) return 'Z'
  if (/^-+$/.test(u)) return '-'
  return 'X'
}

const norm = (b: string) => b.replace(/H/gi, '1').replace(/L/gi, '0')

/** Format a std_logic_vector bit string (MSB first) in the given radix. */
export function formatValue(bits: string, radix: Radix): string {
  if (radix === 'bin') return bits.toUpperCase()
  const meta = metavalue(bits)
  if (meta) return meta
  const b = norm(bits)
  if (b.length === 0) return ''
  const n = BigInt('0b' + b)
  switch (radix) {
    case 'hex':
      return n.toString(16).toUpperCase()
    case 'unsigned':
      return n.toString(10)
    case 'signed':
      return (b[0] === '1' ? n - (1n << BigInt(b.length)) : n).toString(10)
  }
}

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

/** ModelSim shows buses in binary; keep binary for small vectors and hex for wide ones. */
export function defaultRadix(width: number): Radix {
  return width <= 8 ? 'bin' : 'hex'
}
