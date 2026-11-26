/**
 * The contract between the interface (renderer) and the main process.
 *
 * Every request/response method of `Api` is an IPC channel with the same name: the preload
 * exposes it as `window.api.<method>` and main registers a handler for it (main/ipc/handlers.ts).
 * The `Handlers` type makes a missing or mistyped handler a compile error.
 */
import type { Diagnostic, ProjectFile, Std } from './project'
import type { ForceCmd } from './simulation/force'

/** Transcript line categories (colour and prefix in the interface). */
export type LogKind = 'cmd' | 'out' | 'err' | 'info' | 'ok' | 'warn'

/** Native menu items forwarded to the interface. */
export type MenuAction =
  | 'new-project'
  | 'open-folder'
  | 'open-file'
  | 'open-vcd'
  | 'save'
  | 'compile'
  | 'run'
  | 'run-all'
  | 'restart'
  | 'break'
  | 'new-file'

/** Items of the right-click menu of a project file. */
export type FileAction = 'open' | 'rename' | 'duplicate' | 'reveal' | 'copy-path' | 'set-top' | 'trash'

export interface CompileResult {
  ok: boolean
  diagnostics: Diagnostic[]
  /** files that did not compile */
  failed: string[]
}

export interface SimulateResult {
  ok: boolean
  vcdPath?: string
  /** true when the run used the generated force testbench */
  forced?: boolean
}

export interface GhdlStatus {
  path: string | null
  version: string | null
  /** installation hint when GHDL was not found */
  hint: string
}

export interface Api {
  // --- dialogs and menus (native UI owned by main) ---
  openFolderDialog(): Promise<string | null>
  openVcdDialog(): Promise<string | null>
  openFileDialog(): Promise<string | null>
  newProjectDialog(): Promise<{ dir: string; files: string[] } | null>
  addFilesToProject(dir: string): Promise<string[]>
  fileContextMenu(path: string, topEntity: string | null): Promise<FileAction | null>
  // --- project and files ---
  lastProject(): Promise<string | null>
  setLastProject(dir: string): Promise<void>
  listProject(dir: string): Promise<ProjectFile[]>
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  createFile(dir: string, name: string): Promise<string>
  renameFile(path: string, newName: string): Promise<string>
  duplicateFile(path: string): Promise<string>
  trashFile(path: string): Promise<boolean>
  // --- GHDL ---
  ghdlStatus(): Promise<GhdlStatus>
  compile(dir: string, files: string[], std: Std): Promise<CompileResult>
  simulate(dir: string, top: string, stopFs: number | 'all', std: Std, forces?: ForceCmd[]): Promise<SimulateResult>
  stop(): Promise<boolean>
  // --- events pushed by main; return an unsubscribe function ---
  onLog(cb: (kind: LogKind, text: string) => void): () => void
  onMenu(cb: (action: MenuAction) => void): () => void
}

export type InvokeMethod = Exclude<keyof Api, 'onLog' | 'onMenu'>

/** Implementation of every request/response method, as registered in main. */
export type Handlers = {
  [K in InvokeMethod]: (...args: Parameters<Api[K]>) => ReturnType<Api[K]> | Awaited<ReturnType<Api[K]>>
}

// A Record forces this list to name every method exactly once.
const METHODS: Record<InvokeMethod, true> = {
  openFolderDialog: true,
  openVcdDialog: true,
  openFileDialog: true,
  newProjectDialog: true,
  addFilesToProject: true,
  fileContextMenu: true,
  lastProject: true,
  setLastProject: true,
  listProject: true,
  readFile: true,
  writeFile: true,
  createFile: true,
  renameFile: true,
  duplicateFile: true,
  trashFile: true,
  ghdlStatus: true,
  compile: true,
  simulate: true,
  stop: true
}
export const INVOKE_METHODS = Object.keys(METHODS) as InvokeMethod[]

/** Channels of events pushed from main to the interface. */
export const EVENTS = { log: 'log', menu: 'menu' } as const
