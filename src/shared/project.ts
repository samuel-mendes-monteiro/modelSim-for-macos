/**
 * Domain model shared by the main process and the interface: a project is a folder of VHDL
 * files; each file holds design units (entities, packages) and gets compile diagnostics.
 */

/** VHDL standard passed to GHDL (`--std=`). */
export type Std = '08' | '93c'

export type FileKind = 'design' | 'testbench' | 'package'

export interface EntityInfo {
  /** lower-case entity name */
  name: string
  hasPorts: boolean
  /** names of `in`/`inout` ports: they stay 'U' when this entity is simulated as top */
  inputs: string[]
  /** simulation top candidate: no inputs and not instantiated by another project file */
  top: boolean
}

export interface ProjectFile {
  /** absolute path */
  path: string
  /** path relative to the project folder */
  rel: string
  kind: FileKind
  entities: EntityInfo[]
}

export interface Diagnostic {
  file: string
  line: number
  col: number
  severity: 'error' | 'warning' | 'note'
  message: string
}
