import { contextBridge, ipcRenderer } from 'electron'
import type { Api, MenuAction } from '../shared/api'
import type { LogKind } from '../main/ghdl'

const api: Api = {
  openFolderDialog: () => ipcRenderer.invoke('openFolderDialog'),
  openVcdDialog: () => ipcRenderer.invoke('openVcdDialog'),
  openFileDialog: () => ipcRenderer.invoke('openFileDialog'),
  addFilesToProject: (d) => ipcRenderer.invoke('addFilesToProject', d),
  fileContextMenu: (p, t) => ipcRenderer.invoke('fileContextMenu', p, t),
  renameFile: (p, n) => ipcRenderer.invoke('renameFile', p, n),
  duplicateFile: (p) => ipcRenderer.invoke('duplicateFile', p),
  trashFile: (p) => ipcRenderer.invoke('trashFile', p),
  newProjectDialog: () => ipcRenderer.invoke('newProjectDialog'),
  setLastProject: (d) => ipcRenderer.invoke('setLastProject', d),
  lastProject: () => ipcRenderer.invoke('lastProject'),
  listProject: (dir) => ipcRenderer.invoke('listProject', dir),
  readFile: (p) => ipcRenderer.invoke('readFile', p),
  writeFile: (p, c) => ipcRenderer.invoke('writeFile', p, c),
  createFile: (d, n) => ipcRenderer.invoke('createFile', d, n),
  ghdlStatus: () => ipcRenderer.invoke('ghdlStatus'),
  compile: (d, f, s) => ipcRenderer.invoke('compile', d, f, s),
  simulate: (d, t, st, s, f) => ipcRenderer.invoke('simulate', d, t, st, s, f ?? []),
  stop: () => ipcRenderer.invoke('stop'),
  onLog: (cb) => {
    const h = (_e: unknown, k: LogKind, t: string) => cb(k, t)
    ipcRenderer.on('log', h)
    return () => ipcRenderer.removeListener('log', h)
  },
  onMenu: (cb) => {
    const h = (_e: unknown, a: MenuAction) => cb(a)
    ipcRenderer.on('menu', h)
    return () => ipcRenderer.removeListener('menu', h)
  }
}

contextBridge.exposeInMainWorld('api', api)
