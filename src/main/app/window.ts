/** The single application window and the channel used to push events to it. */
import { BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { EVENTS, type LogKind, type MenuAction } from '@shared/contract'

let win: BrowserWindow | null = null

export function mainWindow(): BrowserWindow | null {
  return win
}

export function createWindow(): BrowserWindow {
  win = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 900,
    minHeight: 600,
    title: 'VHDL Sim',
    backgroundColor: '#1e1f22',
    titleBarStyle: 'hiddenInset',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false, contextIsolation: true }
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  win.on('closed', () => (win = null))
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}

/** Push a Transcript line to the interface. */
export function sendLog(kind: LogKind, text: string) {
  win?.webContents.send(EVENTS.log, kind, text)
}

/** Forward a native menu click to the interface. */
export function sendMenu(action: MenuAction) {
  win?.webContents.send(EVENTS.menu, action)
}
