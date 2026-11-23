import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, shell } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join, relative, extname, basename, dirname } from 'node:path'
import { forceWrapper } from './forceTb'
import type { ForceCmd } from '../shared/force'
import { compileFiles, simulate, scanUnits, findGhdl, stopCurrent, toolEnv, GHDL_MISSING_HINT, LogKind, Std } from './ghdl'
import type { ProjectFile, MenuAction, FileAction } from '../shared/api'
import { renameFile, duplicateFile, copyIntoProject, Conflict } from './fileOps'
import { projectTemplate } from './templates'

let win: BrowserWindow | null = null
const settingsPath = () => join(app.getPath('userData'), 'settings.json')

function loadSettings(): { lastProject?: string } {
  try {
    return JSON.parse(readFileSync(settingsPath(), 'utf8'))
  } catch {
    return {}
  }
}
function saveSettings(s: { lastProject?: string }) {
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(settingsPath(), JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

const SKIP_DIRS = new Set(['node_modules', '.git', '.vhdlsim', 'out', 'dist'])

function listVhdl(dir: string, root = dir, depth = 0, acc: string[] = []): string[] {
  if (depth > 8) return acc
  let entries: string[] = []
  try {
    entries = readdirSync(dir)
  } catch {
    return acc
  }
  for (const name of entries) {
    if (name.startsWith('.') || SKIP_DIRS.has(name)) continue
    const p = join(dir, name)
    let st
    try {
      st = statSync(p)
    } catch {
      continue
    }
    if (st.isDirectory()) listVhdl(p, root, depth + 1, acc)
    else if (/\.vhdl?$/i.test(name)) acc.push(p)
  }
  return acc
}

/**
 * Classify files. A testbench / simulation top is an entity without input ports that no other
 * project file instantiates (e.g. a `top` that wires a stimulus generator to the design).
 */
function describeAll(paths: string[], root: string): ProjectFile[] {
  const scanned = paths.map((path) => {
    try {
      return { path, units: scanUnits(readFileSync(path, 'utf8')) }
    } catch {
      return { path, units: { entities: [], packages: [], instantiates: [] } as ReturnType<typeof scanUnits> }
    }
  })
  const used = new Set(scanned.flatMap((s) => s.units.instantiates))
  return scanned.map(({ path, units }) => {
    const entities = units.entities.map((e) => ({ ...e, top: e.inputs.length === 0 && !used.has(e.name) }))
    const isTb = entities.some((e) => e.top) || /_tb\.vhdl?$|^tb_/i.test(basename(path))
    const kind = units.packages.length && !entities.length ? 'package' : isTb ? 'testbench' : 'design'
    return { path, rel: relative(root, path), kind, entities }
  })
}

function sendMenu(action: MenuAction) {
  win?.webContents.send('menu', action)
}

function buildMenu() {
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

function registerIpc() {
  const log = (kind: LogKind, text: string) => win?.webContents.send('log', kind, text)

  ipcMain.handle('openFolderDialog', async () => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory', 'createDirectory'] })
    if (r.canceled || !r.filePaths[0]) return null
    saveSettings({ ...loadSettings(), lastProject: r.filePaths[0] })
    return r.filePaths[0]
  })
  ipcMain.handle('newProjectDialog', async () => {
    const r = await dialog.showSaveDialog(win!, {
      title: 'New Project',
      buttonLabel: 'Create',
      nameFieldLabel: 'Project name:',
      defaultPath: 'my_project',
      properties: ['createDirectory', 'showOverwriteConfirmation']
    })
    if (r.canceled || !r.filePath) return null
    const dir = r.filePath
    if (existsSync(dir) && readdirSync(dir).length) {
      await dialog.showMessageBox(win!, { type: 'error', message: `"${basename(dir)}" already exists and is not empty.` })
      return null
    }
    mkdirSync(dir, { recursive: true })
    const files: string[] = []
    for (const [name, content] of projectTemplate(basename(dir))) {
      const p = join(dir, name)
      writeFileSync(p, content)
      files.push(p)
    }
    saveSettings({ ...loadSettings(), lastProject: dir })
    return { dir, files }
  })
  ipcMain.handle('fileContextMenu', (_e, path: string, topEntity: string | null) =>
    new Promise<FileAction | null>((resolve) => {
      let chosen: FileAction | null = null
      const item = (label: string, action: FileAction, extra: Partial<Electron.MenuItemConstructorOptions> = {}) =>
        ({ label, click: () => (chosen = action), ...extra }) as Electron.MenuItemConstructorOptions
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
      Menu.buildFromTemplate(tpl).popup({ window: win!, callback: () => setTimeout(() => resolve(chosen), 0) })
    }).then((action) => {
      if (action === 'reveal') shell.showItemInFolder(path)
      if (action === 'copy-path') clipboard.writeText(path)
      return action
    })
  )
  ipcMain.handle('renameFile', (_e, path: string, newName: string) => renameFile(path, newName))
  ipcMain.handle('duplicateFile', (_e, path: string) => duplicateFile(path))
  ipcMain.handle('trashFile', async (_e, path: string) => {
    const r = await dialog.showMessageBox(win!, {
      type: 'warning',
      message: `Move "${basename(path)}" to the Trash?`,
      detail: 'You can restore it from the Trash in Finder.',
      buttons: ['Move to Trash', 'Cancel'],
      defaultId: 0,
      cancelId: 1
    })
    if (r.response !== 0) return false
    await shell.trashItem(path)
    return true
  })
  ipcMain.handle('openFileDialog', async () => {
    const r = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      filters: [{ name: 'VHDL', extensions: ['vhd', 'vhdl'] }]
    })
    return r.canceled ? null : r.filePaths[0] ?? null
  })
  ipcMain.handle('addFilesToProject', async (_e, dir: string) => {
    const r = await dialog.showOpenDialog(win!, {
      title: `Add VHDL files to ${basename(dir)}`,
      buttonLabel: 'Add to Project',
      message: 'Files outside the project folder are copied into it.',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'VHDL', extensions: ['vhd', 'vhdl'] }]
    })
    if (r.canceled) return []
    const ask = (name: string): Conflict => {
      const choice = dialog.showMessageBoxSync(win!, {
        type: 'question',
        message: `"${name}" already exists in this project.`,
        detail: 'Replace it with the file you selected, keep both (the copy gets a new name), or skip it?',
        buttons: ['Keep Both', 'Replace', 'Skip'],
        defaultId: 0,
        cancelId: 2
      })
      return (['keep-both', 'replace', 'skip'] as const)[choice]
    }
    return r.filePaths.map((p) => copyIntoProject(p, dir, ask)).filter((p): p is string => !!p)
  })
  ipcMain.handle('setLastProject', (_e, d: string) => saveSettings({ ...loadSettings(), lastProject: d }))
  ipcMain.handle('openVcdDialog', async () => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openFile'], filters: [{ name: 'Waveform', extensions: ['vcd'] }] })
    return r.canceled ? null : r.filePaths[0] ?? null
  })
  ipcMain.handle('lastProject', () => {
    const p = process.env.VHDLSIM_PROJECT || loadSettings().lastProject
    return p && existsSync(p) ? p : null
  })
  ipcMain.handle('listProject', (_e, dir: string) =>
    describeAll(listVhdl(dir).sort(), dir)
  )
  ipcMain.handle('readFile', (_e, p: string) => readFile(p, 'utf8'))
  ipcMain.handle('writeFile', async (_e, p: string, c: string) => {
    mkdirSync(dirname(p), { recursive: true })
    await writeFile(p, c, 'utf8')
  })
  ipcMain.handle('createFile', async (_e, dir: string, name: string) => {
    const file = extname(name) ? name : `${name}.vhd`
    const p = join(dir, file)
    if (existsSync(p)) throw new Error(`${file} already exists`)
    const ent = basename(file, extname(file)).replace(/\W/g, '_')
    await writeFile(
      p,
      `library ieee;\nuse ieee.std_logic_1164.all;\nuse ieee.numeric_std.all;\n\nentity ${ent} is\nend entity ${ent};\n\narchitecture rtl of ${ent} is\nbegin\nend architecture rtl;\n`
    )
    return p
  })
  ipcMain.handle('ghdlStatus', async () => {
    const path = findGhdl()
    if (!path) return { path: null, version: null, hint: GHDL_MISSING_HINT }
    const version = await new Promise<string | null>((res) =>
      execFile(path, ['--version'], { env: toolEnv() }, (err, out) => res(err ? null : out.split('\n')[0]))
    )
    return { path, version, hint: '' }
  })
  ipcMain.handle('compile', (_e, dir: string, files: string[], std: Std) => compileFiles(dir, files, std, log))
  ipcMain.handle('simulate', async (_e, dir: string, top: string, stop: number | 'all', std: Std, forces: ForceCmd[] = []) => {
    let wrapper: string | undefined
    if (forces.length) {
      const src = listVhdl(dir)
        .map((p) => readFileSync(p, 'utf8'))
        .find((t) => scanUnits(t).entities.some((e) => e.name === top))
      try {
        if (!src) throw new Error(`entity ${top} not found in project files`)
        wrapper = forceWrapper(src, top, forces)
      } catch (e) {
        log('err', `** Error: force: ${(e as Error).message}`)
        return { ok: false }
      }
    }
    return simulate(dir, top, stop, std, log, wrapper)
  })
  ipcMain.handle('stop', () => stopCurrent())
}

function createWindow() {
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
  const smoke = process.env.VHDLSIM_SMOKE
  if (smoke) {
    win.webContents.on('console-message', (_e, _l, msg) => console.log('[renderer]', msg))
    // Automated check: compile, run -all, screenshot the window, quit.
    win.webContents.once('did-finish-load', async () => {
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
      await wait(2500)
      const cmds = process.env.VHDLSIM_SMOKE_CMDS
      if (cmds) {
        // type transcript commands (";"-separated), like a user would
        for (const c of cmds.split(';')) {
          await win!.webContents.executeJavaScript(`(() => {
            const i = document.querySelector('.bottom form input')
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(c.trim())})
            i.dispatchEvent(new Event('input', { bubbles: true }))
            i.form.requestSubmit()
          })()`)
          await wait(c.trim().startsWith('run') ? 4000 : 400)
        }
      } else sendMenu('run-all')
      await wait(Number(process.env.VHDLSIM_SMOKE_WAIT ?? 12000))
      const wc = win!.webContents
      const click = async (x: number, y: number, mods: string[] = []) => {
        wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1, modifiers: mods as never })
        wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1, modifiers: mods as never })
        await wait(300)
      }
      if (process.env.VHDLSIM_SMOKE_JS) {
        console.log('smoke js =>', await wc.executeJavaScript(process.env.VHDLSIM_SMOKE_JS).catch((e) => 'ERR ' + e))
        await wait(500)
      }
      if (process.env.VHDLSIM_SMOKE_CLICKS) {
        for (const c of process.env.VHDLSIM_SMOKE_CLICKS.split(';')) {
          const [x, y, m] = c.split(',')
          await click(Number(x), Number(y), m ? [m] : [])
        }
        await wait(800)
      }
      const img = await wc.capturePage()
      writeFileSync(smoke, img.toPNG())
      app.quit()
    })
  }
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  app.setName('VHDL Sim')
  buildMenu()
  registerIpc()
  createWindow()
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
})
app.on('window-all-closed', () => app.quit())
