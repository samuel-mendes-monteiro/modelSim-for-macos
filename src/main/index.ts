/** Main process entry point: wires the window, the menu and the IPC handlers together. */
import { app, BrowserWindow } from 'electron'
import { buildMenu } from './app/menu'
import { attachSmokeTest } from './app/smoke'
import { createWindow, mainWindow } from './app/window'
import { registerIpc } from './ipc/handlers'

function openWindow() {
  attachSmokeTest(createWindow())
}

app.whenReady().then(() => {
  app.setName('VHDL Sim')
  buildMenu()
  registerIpc(mainWindow)
  openWindow()
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && openWindow())
})
app.on('window-all-closed', () => app.quit())
