/** Native dialogs and menus. Each returns the user's choice; no project logic lives here. */
import { BrowserWindow, dialog, Menu } from 'electron'
import { basename } from 'node:path'
import type { FileAction } from '@shared/contract'
import type { Conflict } from '../project/fileOps'

const VHDL_FILTER = [{ name: 'VHDL', extensions: ['vhd', 'vhdl'] }]

export async function chooseFolder(win: BrowserWindow): Promise<string | null> {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
  return r.canceled ? null : r.filePaths[0] ?? null
}

export async function chooseNewProjectFolder(win: BrowserWindow): Promise<string | null> {
  const r = await dialog.showSaveDialog(win, {
    title: 'New Project',
    buttonLabel: 'Create',
    nameFieldLabel: 'Project name:',
    defaultPath: 'my_project',
    properties: ['createDirectory', 'showOverwriteConfirmation']
  })
  return r.canceled ? null : r.filePath ?? null
}

export async function chooseVhdlFile(win: BrowserWindow): Promise<string | null> {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: VHDL_FILTER })
  return r.canceled ? null : r.filePaths[0] ?? null
}

export async function chooseVhdlFilesToAdd(win: BrowserWindow, projectDir: string): Promise<string[]> {
  const r = await dialog.showOpenDialog(win, {
    title: `Add VHDL files to ${basename(projectDir)}`,
    buttonLabel: 'Add to Project',
    message: 'Files outside the project folder are copied into it.',
    properties: ['openFile', 'multiSelections'],
    filters: VHDL_FILTER
  })
  return r.canceled ? [] : r.filePaths
}

export async function chooseVcdFile(win: BrowserWindow): Promise<string | null> {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Waveform', extensions: ['vcd'] }] })
  return r.canceled ? null : r.filePaths[0] ?? null
}

/** Asked while adding files: a file with the same name already exists in the project. */
export function askConflict(win: BrowserWindow, name: string): Conflict {
  const choice = dialog.showMessageBoxSync(win, {
    type: 'question',
    message: `"${name}" already exists in this project.`,
    detail: 'Replace it with the file you selected, keep both (the copy gets a new name), or skip it?',
    buttons: ['Keep Both', 'Replace', 'Skip'],
    defaultId: 0,
    cancelId: 2
  })
  return (['keep-both', 'replace', 'skip'] as const)[choice]
}

export async function confirmTrash(win: BrowserWindow, path: string): Promise<boolean> {
  const r = await dialog.showMessageBox(win, {
    type: 'warning',
    message: `Move "${basename(path)}" to the Trash?`,
    detail: 'You can restore it from the Trash in Finder.',
    buttons: ['Move to Trash', 'Cancel'],
    defaultId: 0,
    cancelId: 1
  })
  return r.response === 0
}

export async function showError(win: BrowserWindow, message: string) {
  await dialog.showMessageBox(win, { type: 'error', message })
}

/** Right-click menu of a project file; resolves with the chosen item (null if dismissed). */
export function fileMenu(win: BrowserWindow, topEntity: string | null): Promise<FileAction | null> {
  return new Promise((resolve) => {
    let chosen: FileAction | null = null
    const item = (label: string, action: FileAction): Electron.MenuItemConstructorOptions => ({ label, click: () => (chosen = action) })
    const tpl: Electron.MenuItemConstructorOptions[] = [
      item('Open', 'open'),
      ...(topEntity ? [item(`Set "${topEntity}" as Top`, 'set-top')] : []),
      { type: 'separator' },
      item('Rename…', 'rename'),
      item('Duplicate', 'duplicate'),
      { type: 'separator' },
      item('Reveal in Finder', 'reveal'),
      item('Copy Path', 'copy-path'),
      { type: 'separator' },
      item('Move to Trash', 'trash')
    ]
    Menu.buildFromTemplate(tpl).popup({ window: win, callback: () => setTimeout(() => resolve(chosen), 0) })
  })
}
