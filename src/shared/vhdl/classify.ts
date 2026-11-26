import type { EntityInfo, ProjectFile } from '../project'
import { EMPTY_UNITS, scanUnits, type Units } from './scan'

export interface SourceFile {
  path: string
  rel: string
  /** file content, or null when it could not be read */
  text: string | null
}

const TB_NAME = /(^|\/)(tb_[^/]*|[^/]*_tb\.vhdl?)$/i

/**
 * Classify project files. A testbench / simulation top is an entity without input ports that no
 * other project file instantiates (e.g. a `top` that wires a stimulus generator to the design),
 * or a file named `*_tb.vhd` / `tb_*`.
 */
export function classifyFiles(sources: SourceFile[]): ProjectFile[] {
  const scanned = sources.map((s) => ({ ...s, units: s.text === null ? EMPTY_UNITS : scanUnits(s.text) }))
  const used = new Set(scanned.flatMap((s) => s.units.instantiates))
  return scanned.map(({ path, rel, units }) => {
    const entities: EntityInfo[] = units.entities.map((e) => ({ ...e, top: e.inputs.length === 0 && !used.has(e.name) }))
    return { path, rel, kind: fileKind(units, entities, rel), entities }
  })
}

function fileKind(units: Units, entities: EntityInfo[], rel: string): ProjectFile['kind'] {
  if (units.packages.length && !entities.length) return 'package'
  return entities.some((e) => e.top) || TB_NAME.test(rel) ? 'testbench' : 'design'
}

/** Entities of the project, simulation tops first (order of the Top selector). */
export function entitiesForTop(files: ProjectFile[]): EntityInfo[] {
  const all = files.flatMap((f) => f.entities)
  return [...all.filter((e) => e.top), ...all.filter((e) => !e.top)]
}

/** Best guess for the Top selector when a project opens. */
export function defaultTop(files: ProjectFile[]): string {
  const all = files.flatMap((f) => f.entities)
  return (all.find((e) => e.top) ?? all.find((e) => !e.inputs.length) ?? all[0])?.name ?? ''
}
