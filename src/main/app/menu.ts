/** Native application menu. Items only forward a MenuAction; the interface decides what to do. */
import { Menu, shell } from 'electron'
import { sendMenu } from './window'

export function buildMenu() {
  const tpl: Electron.MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    {
      label: 'File',
      submenu: [
        { label: 'New Project…', accelerator: 'CmdOrCtrl+Shift+N', click: () => sendMenu('new-project') },
        { label: 'Open Project Folder…', accelerator: 'CmdOrCtrl+O', click: () => sendMenu('open-folder') },
        { label: 'Add VHDL File to Project…', accelerator: 'CmdOrCtrl+Alt+O', click: () => sendMenu('open-file') },
        { label: 'New VHDL File…', accelerator: 'CmdOrCtrl+N', click: () => sendMenu('new-file') },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => sendMenu('save') },
        { type: 'separator' },
        { label: 'Open Waveform (VCD)…', accelerator: 'CmdOrCtrl+Shift+O', click: () => sendMenu('open-vcd') },
        { type: 'separator' },
        { role: 'close' }
      ]
    },
    { role: 'editMenu' },
    {
      label: 'Compile',
      submenu: [{ label: 'Compile All', accelerator: 'CmdOrCtrl+B', click: () => sendMenu('compile') }]
    },
    {
      label: 'Simulate',
      submenu: [
        { label: 'Run (run length)', accelerator: 'F9', click: () => sendMenu('run') },
        { label: 'Run -All', accelerator: 'Shift+F9', click: () => sendMenu('run-all') },
        { label: 'Break', accelerator: 'CmdOrCtrl+.', click: () => sendMenu('break') },
        { label: 'Restart', accelerator: 'CmdOrCtrl+R', click: () => sendMenu('restart') }
      ]
    },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    { role: 'help', submenu: [{ label: 'GHDL Documentation', click: () => shell.openExternal('https://ghdl.github.io/ghdl/') }] }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl))
}
