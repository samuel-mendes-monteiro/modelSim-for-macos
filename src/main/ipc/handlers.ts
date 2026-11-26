/**
 * IPC handlers: one per method of the Api contract (shared/contract.ts). Handlers stay thin —
 * they read arguments, call a dialog or a service, and return the result.
 */
import { clipboard, ipcMain, shell, type BrowserWindow } from 'electron'
import { mkdirSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { INVOKE_METHODS, type Handlers } from '@shared/contract'
import { compileFiles } from '../ghdl/compile'
import { forceWrapper } from '../ghdl/forceWrapper'
import { stopCurrent } from '../ghdl/process'
import { simulate } from '../ghdl/simulate'
import { ghdlStatus } from '../ghdl/toolchain'
import { lastProject, setLastProject } from '../app/settings'
import { sendLog } from '../app/window'
import { copyIntoProject, createProject, createVhdlFile, duplicateFile, renameFile } from '../project/fileOps'
import { findEntitySource, listProject } from '../project/files'
import * as dialogs from './dialogs'

export function createHandlers(getWin: () => BrowserWindow | null): Handlers {
  const win = () => {
    const w = getWin()
    if (!w) throw new Error('No window')
    return w
  }

  return {
    // --- dialogs and menus ---
    openFolderDialog: async () => {
      const dir = await dialogs.chooseFolder(win())
      if (dir) setLastProject(dir)
      return dir
    },
    newProjectDialog: async () => {
      const dir = await dialogs.chooseNewProjectFolder(win())
      if (!dir) return null
      try {
        const files = createProject(dir)
        setLastProject(dir)
        return { dir, files }
      } catch (e) {
        await dialogs.showError(win(), (e as Error).message)
        return null
      }
    },
    openFileDialog: () => dialogs.chooseVhdlFile(win()),
    openVcdDialog: () => dialogs.chooseVcdFile(win()),
    addFilesToProject: async (dir) => {
      const picked = await dialogs.chooseVhdlFilesToAdd(win(), dir)
      return picked.map((p) => copyIntoProject(p, dir, (name) => dialogs.askConflict(win(), name))).filter((p): p is string => !!p)
    },
    fileContextMenu: async (path, topEntity) => {
      const action = await dialogs.fileMenu(win(), topEntity)
      // actions that need no interface work are completed here
      if (action === 'reveal') shell.showItemInFolder(path)
      if (action === 'copy-path') clipboard.writeText(path)
      return action
    },

    // --- project and files ---
    lastProject: () => lastProject(),
    setLastProject: (dir) => setLastProject(dir),
    listProject: (dir) => listProject(dir),
    readFile: (path) => readFile(path, 'utf8'),
    writeFile: async (path, content) => {
      mkdirSync(dirname(path), { recursive: true })
      await writeFile(path, content, 'utf8')
    },
    createFile: (dir, name) => createVhdlFile(dir, name),
    renameFile: (path, newName) => renameFile(path, newName),
    duplicateFile: (path) => duplicateFile(path),
    trashFile: async (path) => {
      if (!(await dialogs.confirmTrash(win(), path))) return false
      await shell.trashItem(path)
      return true
    },

    // --- GHDL ---
    ghdlStatus: () => ghdlStatus(),
    compile: (dir, files, std) => compileFiles(dir, files, std, sendLog),
    simulate: async (dir, top, stopFs, std, forces = []) => {
      let wrapper: string | undefined
      if (forces.length) {
        try {
          const src = findEntitySource(dir, top)
          if (!src) throw new Error(`entity ${top} not found in project files`)
          wrapper = forceWrapper(src, top, forces)
        } catch (e) {
          sendLog('err', `** Error: force: ${(e as Error).message}`)
          return { ok: false }
        }
      }
      return simulate(dir, top, stopFs, std, sendLog, wrapper)
    },
    stop: () => stopCurrent()
  }
}

export function registerIpc(getWin: () => BrowserWindow | null) {
  const handlers = createHandlers(getWin)
  for (const method of INVOKE_METHODS) {
    const fn = handlers[method] as (...args: unknown[]) => unknown
    ipcMain.handle(method, (_e, ...args: unknown[]) => fn(...args))
  }
}
