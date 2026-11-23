import type { Diagnostic, LogKind, Std } from '../main/ghdl'
import type { ForceCmd } from './force'
export type { Diagnostic, LogKind, Std }

export type FileKind = 'design' | 'testbench' | 'package'

export interface ProjectFile {
  path: string
  rel: string
  kind: FileKind
  /** inputs: input port names (undriven when simulated as top). top: no inputs and not instantiated by another project file. */
  entities: { name: string; hasPorts: boolean; inputs: string[]; top: boolean }[]
}

export type MenuAction = 'new-project' | 'open-folder' | 'open-file' | 'open-vcd' | 'save' | 'compile' | 'run' | 'run-all' | 'restart' | 'break' | 'new-file'

export type FileAction = 'open' | 'rename' | 'duplicate' | 'reveal' | 'copy-path' | 'set-top' | 'trash'

export interface Api {
  openFolderDialog(): Promise<string | null>
  openVcdDialog(): Promise<string | null>
  openFileDialog(): Promise<string | null>
  addFilesToProject(dir: string): Promise<string[]>
  fileContextMenu(path: string, topEntity: string | null): Promise<FileAction | null>
  renameFile(path: string, newName: string): Promise<string>
  duplicateFile(path: string): Promise<string>
  trashFile(path: string): Promise<boolean>
  newProjectDialog(): Promise<{ dir: string; files: string[] } | null>
  setLastProject(dir: string): Promise<void>
  lastProject(): Promise<string | null>
  listProject(dir: string): Promise<ProjectFile[]>
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  createFile(dir: string, name: string): Promise<string>
  ghdlStatus(): Promise<{ path: string | null; version: string | null; hint: string }>
  compile(dir: string, files: string[], std: Std): Promise<{ ok: boolean; diagnostics: Diagnostic[]; failed: string[] }>
  simulate(dir: string, top: string, stopFs: number | 'all', std: Std, forces?: ForceCmd[]): Promise<{ ok: boolean; vcdPath?: string; forced?: boolean }>
  stop(): Promise<boolean>
  onLog(cb: (kind: LogKind, text: string) => void): () => void
  onMenu(cb: (action: MenuAction) => void): () => void
}
