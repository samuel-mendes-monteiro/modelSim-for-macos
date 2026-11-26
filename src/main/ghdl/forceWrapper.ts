/**
 * Generates the VHDL testbench that applies `force` commands: it instantiates the top entity as
 * `dut` and drives each forced input from a process. Pure text in, text out (no file system).
 */
import { FORCE_DUT, FORCE_TB, type ForceCmd } from '@shared/simulation/force'
import { stripComments } from '@shared/vhdl/scan'

export interface PortDecl {
  name: string
  mode: 'in' | 'out' | 'inout' | 'buffer' | 'linkage'
  type: string
}
export interface GenericDecl {
  name: string
  type: string
  def?: string
}

/** Contents of the parenthesised list that starts at `open` (index of "("). */
function balanced(code: string, open: number): string | null {
  let depth = 0
  for (let i = open; i < code.length; i++) {
    if (code[i] === '(') depth++
    else if (code[i] === ')' && --depth === 0) return code.slice(open + 1, i)
  }
  return null
}

/** Same text with everything inside parentheses blanked (to find keywords at depth 0). */
function maskParens(t: string): string {
  let depth = 0
  let out = ''
  for (const ch of t) {
    if (ch === '(') depth++
    out += depth > 0 ? ' ' : ch
    if (ch === ')') depth--
  }
  return out
}

function splitTop(list: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of list) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ';' && depth === 0) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out.map((x) => x.trim()).filter(Boolean)
}

/** Port and generic declarations of `entity` in `src` (null if the entity is not there). */
export function parseEntity(src: string, entity: string): { ports: PortDecl[]; generics: GenericDecl[] } | null {
  const code = stripComments(src)
  const m = new RegExp(`\\bentity\\s+${entity}\\s+is\\b`, 'i').exec(code)
  if (!m) return null
  const endM = /\bend\b/i.exec(maskParens(code.slice(m.index + m[0].length)))
  const body = code.slice(m.index + m[0].length, endM ? m.index + m[0].length + endM.index : undefined)
  const clause = (kw: string) => {
    const k = new RegExp(`\\b${kw}\\s*\\(`, 'i').exec(body)
    return k ? balanced(body, k.index + k[0].length - 1) : null
  }
  const ports: PortDecl[] = []
  for (const d of splitTop(clause('port') ?? '')) {
    const pm = d.match(/^([\w\s,]+?)\s*:\s*(?:(in|out|inout|buffer|linkage)\s+)?([\s\S]+?)(?:\s*:=[\s\S]*)?$/i)
    if (!pm) continue
    for (const n of pm[1].split(',')) ports.push({ name: n.trim().toLowerCase(), mode: (pm[2]?.toLowerCase() ?? 'in') as PortDecl['mode'], type: pm[3].trim() })
  }
  const generics: GenericDecl[] = []
  for (const d of splitTop(clause('generic') ?? '')) {
    const gm = d.match(/^([\w\s,]+?)\s*:\s*([\s\S]+?)(?:\s*:=\s*([\s\S]+))?$/i)
    if (!gm) continue
    for (const n of gm[1].split(',')) generics.push({ name: n.trim().toLowerCase(), type: gm[2].trim(), def: gm[3]?.trim() })
  }
  return { ports, generics }
}

/** `library`/`use` clauses of the file, so port types from user packages still resolve. */
function contextClauses(src: string): string[] {
  return [...stripComments(src).matchAll(/^\s*(library\s+[\w\s,]+;|use\s+[\w.]+;)/gim)].map((x) => x[1].trim())
}

/** Bit width of a vector type such as `std_logic_vector(7 downto 0)` (null if not computable). */
function vectorWidth(type: string, consts: Record<string, number>): number | null {
  const m = type.match(/\(\s*(.+?)\s+(downto|to)\s+(.+?)\s*\)\s*$/i)
  if (!m) return null
  const ev = (e: string): number | null => {
    const expr = e.replace(/\b[a-z_]\w*\b/gi, (id) => (id.toLowerCase() in consts ? String(consts[id.toLowerCase()]) : 'NaN'))
    if (!/^[\d\s+\-*/()NaN]+$/.test(expr)) return null
    // eslint-disable-next-line no-new-func
    const v = Function(`return (${expr})`)()
    return Number.isFinite(v) ? Math.trunc(v) : null
  }
  const a = ev(m[1])
  const b = ev(m[3])
  return a === null || b === null ? null : Math.abs(a - b) + 1
}

/** Convert a ModelSim force value into a VHDL literal for `type`. Throws with a readable message. */
export function vhdlLiteral(value: string, type: string, consts: Record<string, number> = {}): string {
  const v = value.replace(/^['"]|['"]$/g, '')
  const base = type.toLowerCase().replace(/\s+/g, '')
  if (/^(std_u?logic|bit)$/.test(base)) {
    if (!/^[01uxzwlh-]$/i.test(v) || (base === 'bit' && !/^[01]$/.test(v))) throw new Error(`"${value}" is not a valid ${type} value`)
    return `'${v.toUpperCase()}'`
  }
  if (base === 'boolean') {
    if (!/^(true|false|1|0)$/i.test(v)) throw new Error(`"${value}" is not a boolean`)
    return /^(true|1)$/i.test(v) ? 'true' : 'false'
  }
  if (/^(integer|natural|positive)$/.test(base) || /^integerrange/.test(base)) {
    const n = parseNumber(v)
    if (n === null) throw new Error(`"${value}" is not an integer`)
    return n.toString()
  }
  const w = vectorWidth(type, consts)
  if (w === null) throw new Error(`cannot force signals of type "${type}"`)
  // a string of 0/1 (or U/X/Z/-…) is a bit string; anything else is a (based) number
  let bits: string
  if (/^[01uxzwlh-]+$/i.test(v) && !/^-\d+$/.test(v)) bits = v.toUpperCase()
  else {
    const n = parseNumber(v)
    if (n === null) throw new Error(`"${value}" is not a valid value for ${type}`)
    const mod = 1n << BigInt(w)
    if (n >= mod || n < -(mod >> 1n)) throw new Error(`"${value}" does not fit in ${w} bits`)
    bits = (((n % mod) + mod) % mod).toString(2)
  }
  if (bits.length > w) throw new Error(`"${value}" does not fit in ${w} bits`)
  return `"${bits.padStart(w, /^[uxz]/i.test(bits) ? bits[0] : '0')}"`
}

/** 10, -3, 16#FF, 2#1010, 8#17, x"A5", h#A */
function parseNumber(v: string): bigint | null {
  let m = v.match(/^(-?)(\d+)#([0-9a-f_]+)#?$/i)
  if (m) {
    const r = Number(m[2])
    const digits = m[3].replace(/_/g, '').toLowerCase()
    if (![...digits].every((c) => parseInt(c, 16) < r)) return null
    let n = 0n
    for (const c of digits) n = n * BigInt(r) + BigInt(parseInt(c, 16))
    return m[1] ? -n : n
  }
  m = v.match(/^([xob])"?([0-9a-f_]+)"?$/i) ?? v.match(/^(h)#?([0-9a-f_]+)$/i)
  if (m) return parseNumber(`${{ x: 16, h: 16, o: 8, b: 2 }[m[1].toLowerCase() as 'x']}#${m[2]}`)
  if (/^-?\d+$/.test(v)) return BigInt(v)
  return null
}

const fsTime = (fs: number) => `${Math.round(fs)} fs`

/**
 * VHDL source of a testbench that instantiates `top` and drives the forced inputs.
 * Throws Error with a user-facing message for unknown signals / bad values.
 */
export function forceWrapper(src: string, top: string, forces: ForceCmd[]): string {
  const ent = parseEntity(src, top)
  if (!ent) throw new Error(`entity ${top} not found`)
  const consts: Record<string, number> = {}
  for (const g of ent.generics) if (g.def && /^-?\d+$/.test(g.def)) consts[g.name] = Number(g.def)
  const byName = new Map(ent.ports.map((p) => [p.name, p]))
  const bySignal = new Map<string, ForceCmd[]>()
  for (const f of forces) {
    const p = byName.get(f.signal)
    if (!p) throw new Error(`"${f.signal}" is not a port of ${top} (only top-level ports can be forced)`)
    if (p.mode === 'out' || p.mode === 'buffer') throw new Error(`"${f.signal}" is an output of ${top}; only inputs can be forced`)
    bySignal.set(f.signal, [...(bySignal.get(f.signal) ?? []), f])
  }

  const generics = ent.generics.filter((g) => g.def).map((g) => `  constant ${g.name} : ${g.type} := ${g.def};`)
  const missing = ent.generics.filter((g) => !g.def)
  if (missing.length) throw new Error(`generic(s) without default value: ${missing.map((g) => g.name).join(', ')}`)
  const signals = ent.ports.map((p) => `  signal ${p.name} : ${p.type};`)

  const procs: string[] = []
  for (const [sig, cmds] of bySignal) {
    const type = byName.get(sig)!.type
    const sorted = [...cmds].sort((a, b) => a.start - b.start)
    const lines: string[] = []
    sorted.forEach((f, k) => {
      const next = sorted[k + 1]?.start
      const limit = next === undefined ? 'time\'high' : fsTime(next)
      lines.push(`    -- ${f.pairs.map((p) => p.v).join(', ')}${f.repeat ? ' (repeat)' : ''}`)
      lines.push(`    base := ${fsTime(f.start)};`)
      lines.push('    loop')
      for (const p of f.pairs) {
        lines.push(`      if base + ${fsTime(p.t)} > now then wait for tmin(base + ${fsTime(p.t)} - now, ${limit} - now); end if;`)
        lines.push(`      exit when now >= ${limit};`)
        lines.push(`      ${sig} <= ${vhdlLiteral(p.v, type, consts)};`)
      }
      lines.push(f.repeat ? `      base := base + ${fsTime(f.repeat)};` : '      exit;')
      lines.push('    end loop;')
      if (next !== undefined) lines.push(`    if now < ${limit} then wait for ${limit} - now; end if;`)
    })
    procs.push(
      [
        `  force_${sig}: process`,
        '    variable base : time;',
        '    function tmin(a, b : time) return time is begin if a < b then return a; else return b; end if; end function;',
        '  begin',
        ...lines,
        '    wait;',
        '  end process;'
      ].join('\n')
    )
  }

  const ctx = [...new Set(['library ieee;', 'use ieee.std_logic_1164.all;', ...contextClauses(src)])]
  return [
    '-- Generated by VHDL Sim for "force" commands. Do not edit.',
    ...ctx,
    '',
    `entity ${FORCE_TB} is`,
    `end ${FORCE_TB};`,
    '',
    `architecture sim of ${FORCE_TB} is`,
    ...generics,
    ...signals,
    'begin',
    `  ${FORCE_DUT}: entity work.${top}`,
    `    port map (${ent.ports.map((p) => `${p.name} => ${p.name}`).join(', ')});`,
    '',
    ...procs,
    'end sim;',
    ''
  ].join('\n')
}
