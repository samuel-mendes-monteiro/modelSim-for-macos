/**
 * Lightweight scan of VHDL design units. It is not a parser: it is good enough to order files
 * for compilation, find testbenches and list the inputs of an entity.
 */

export interface ScannedEntity {
  name: string
  hasPorts: boolean
  inputs: string[]
}

export interface Units {
  entities: ScannedEntity[]
  packages: string[]
  /** entity/component names this file instantiates (lower case) */
  instantiates: string[]
}

export const EMPTY_UNITS: Units = { entities: [], packages: [], instantiates: [] }

/** Source text without `--` and `/* … *\/` comments. */
export function stripComments(src: string): string {
  return src.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Names of the `in`/`inout` ports of a port clause (mode omitted = in). */
function inputPorts(portClause: string): string[] {
  const out: string[] = []
  for (const decl of portClause.split(';')) {
    const m = decl.match(/([\w\s,]+?)\s*:(?!=)\s*(\w+)/)
    if (!m) continue
    if (/^(out|buffer|linkage)$/i.test(m[2])) continue
    out.push(
      ...m[1]
        .replace(/^[\s\S]*\bport\s*\(/i, '')
        .split(',')
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean)
    )
  }
  return out
}

export function scanUnits(src: string): Units {
  const code = stripComments(src)
  const entities: ScannedEntity[] = []
  const re = /\bentity\s+(\w+)\s+is\b([\s\S]*?)\bend\b/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(code))) {
    const p = m[2].search(/\bport\s*\(/i)
    entities.push({ name: m[1].toLowerCase(), hasPorts: p >= 0, inputs: p >= 0 ? inputPorts(m[2].slice(p)) : [] })
  }
  const packages = [...code.matchAll(/\bpackage\s+(?!body\b)(\w+)\s+is\b/gi)].map((x) => x[1].toLowerCase())
  const instantiates = [
    ...[...code.matchAll(/\bentity\s+\w+\.(\w+)/gi)].map((x) => x[1]),
    ...[...code.matchAll(/\b\w+\s*:\s*(?:component\s+)?(\w+)\s+(?:generic|port)\s+map\b/gi)].map((x) => x[1])
  ].map((x) => x.toLowerCase())
  return { entities, packages, instantiates: [...new Set(instantiates)] }
}
