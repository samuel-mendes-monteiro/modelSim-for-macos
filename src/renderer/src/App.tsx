import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Diagnostic, LogKind, MenuAction, ProjectFile, Std } from '@shared/api'
import { parseVcd, VcdData } from '@shared/vcd'
import { defaultRadix, formatTime, parseTime, Radix } from '@shared/radix'
import ProjectPanel, { FileStatus } from './components/ProjectPanel'
import EditorPane from './components/EditorPane'
import Transcript, { LogLine } from './components/Transcript'
import Waveform, { WaveItem, signalKey } from './components/Waveform'
import { ForceCmd, parseForce, describeForce } from '@shared/force'

const FORCE_TB = 'vhdlsim_force'

/** Show a wrapped (forced) simulation as if `top` were simulated directly: /vhdlsim_force/dut/x → /top/x. */
function unwrapForce(data: VcdData, top: string): VcdData {
  const signals = data.signals
    .filter((s) => !(s.scope.length === 1 && s.scope[0] === FORCE_TB))
    .map((s) => (s.scope[0] === FORCE_TB && s.scope[1] === 'dut' ? { ...s, scope: [top, ...s.scope.slice(2)] } : s))
  return { ...data, signals }
}

const SESSION_VERSION = 2

interface Session {
  waves: WaveItem[]
  forces: ForceCmd[]
}

interface Tab {
  path: string
  content: string
  saved: string
}

const WAVE_TAB = '__wave__'
const MAX_LOG = 5000
let logId = 0

const HELP = [
  'Commands (ModelSim-style):',
  '  vcom                 compile all project files',
  '  vsim <top>           select the top-level entity (testbench)',
  '  run [<time> [unit]]  advance the simulation (default: run length in toolbar)',
  '  run -all             run until the testbench stops (60 s safety limit)',
  '  restart              reset simulation time to 0',
  '  break                stop a running simulation',
  '  add wave <pattern>   add signals to the wave (e.g. add wave *, add wave /tb/dut/*)',
  '  delete wave *        remove all signals from the wave',
  '  radix <bin|hex|unsigned|signed>   set the radix of all signals',
  '  force <sig> <v> [<t>][, <v> <t>]... [-repeat <period>]',
  '                       drive a top-level input (times in ns by default, relative to now)',
  '                       e.g. force clock 0 0, 1 50 -repeat 100   force reset 1   force dload 16#9',
  '  force                list active forces',
  '  noforce <sig>|*      remove forces (takes effect on the next run)',
  '  std <08|93c>         VHDL standard',
  '  clear                clear the transcript'
]

export default function App() {
  const [dir, setDir] = useState<string | null>(null)
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [tabs, setTabs] = useState<Tab[]>([])
  const [active, setActive] = useState<string>(WAVE_TAB)
  const [reveal, setReveal] = useState<{ line: number; col: number; nonce: number } | null>(null)
  const [logs, setLogs] = useState<LogLine[]>([])
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([])
  const [status, setStatus] = useState<Record<string, FileStatus>>({})
  const [compiledOk, setCompiledOk] = useState(false)
  const [std, setStd] = useState<Std>('08')
  const [top, setTop] = useState('')
  const [runLength, setRunLength] = useState('100 ns')
  const [simTime, setSimTime] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [vcd, setVcd] = useState<VcdData | null>(null)
  const [vcdTitle, setVcdTitle] = useState('')
  const [waves, setWaves] = useState<WaveItem[]>([])
  const [forces, setForces] = useState<ForceCmd[]>([])
  const [ghdl, setGhdl] = useState<{ path: string | null; version: string | null }>({ path: null, version: null })
  const [leftW, setLeftW] = useState(260)
  const [bottomH, setBottomH] = useState(210)

  const log = useCallback((kind: LogKind, text: string) => {
    setLogs((l) => {
      const next = l.length > MAX_LOG ? l.slice(-MAX_LOG) : l.slice()
      next.push({ id: ++logId, kind, text })
      return next
    })
  }, [])

  useEffect(() => window.api.onLog(log), [log])

  // ---------- per-top session (.vhdlsim/session-<top>.json): wave signals, radix, forces ----------
  const sessionFor = useRef<string | null>(null)
  useEffect(() => {
    sessionFor.current = null
    setForces([])
    if (!dir || !top) return
    const key = `${dir}|${top}`
    window.api
      .readFile(`${dir}/.vhdlsim/session-${top}.json`)
      .then((t) => {
        const s = JSON.parse(t) as Partial<Session> & { v?: number }
        // v1 sessions stored the old hex default for every bus: let new defaults apply
        if (Array.isArray(s.waves) && s.v === SESSION_VERSION) setWaves(s.waves)
        if (Array.isArray(s.forces)) {
          setForces(s.forces)
          if (s.forces.length) log('info', `Restored ${s.forces.length} force command(s) for ${top} (type "force" to list, "noforce *" to clear).`)
        }
      })
      .catch(() => {})
      .finally(() => {
        sessionFor.current = key
      })
  }, [dir, top, log])
  useEffect(() => {
    if (!dir || !top || sessionFor.current !== `${dir}|${top}`) return
    const t = setTimeout(() => {
      const s = { v: SESSION_VERSION, waves, forces }
      window.api.writeFile(`${dir}/.vhdlsim/session-${top}.json`, JSON.stringify(s, null, 1)).catch(() => {})
    }, 400)
    return () => clearTimeout(t)
  }, [dir, top, waves, forces])

  // ---------- project ----------
  const refresh = useCallback(async (d = dir) => {
    if (!d) return
    const list = await window.api.listProject(d)
    setFiles(list)
    return list
  }, [dir])

  const openProject = useCallback(async (d: string, fileToOpen?: string) => {
    setDir(d)
    setTabs([])
    setActive(WAVE_TAB)
    setDiagnostics([])
    setStatus({})
    setCompiledOk(false)
    setSimTime(0)
    setVcd(null)
    setWaves([])
    const list = await window.api.listProject(d)
    setFiles(list)
    const all = list.flatMap((f) => f.entities)
    setTop((all.find((e) => e.top) ?? all.find((e) => !e.inputs.length) ?? all[0])?.name ?? '')
    log('info', `Project opened: ${d} (${list.length} VHDL file(s))`)
    const first = fileToOpen ?? (list.find((f) => f.kind === 'design') ?? list[0])?.path
    if (first) openFile(first)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log])

  useEffect(() => {
    window.api.ghdlStatus().then((s) => {
      setGhdl(s)
      if (s.path) log('info', `${s.version ?? 'GHDL'} — ${s.path}`)
      else log('err', s.hint)
    })
    window.api.lastProject().then((p) => { if (p) openProject(p) })
  }, [log, openProject])

  /**
   * With a project open: add VHDL files to it (files from other folders are copied into the project).
   * With no project open: the file's folder becomes the project.
   */
  const openSingleFile = async () => {
    if (dir) {
      try {
        const added = await window.api.addFilesToProject(dir)
        if (!added.length) return
        for (const p of added) log('info', `Added to project: ${p.split('/').pop()}`)
        setCompiledOk(false)
        await refresh()
        openFile(added[added.length - 1])
      } catch (e) {
        log('err', String(e))
      }
      return
    }
    const p = await window.api.openFileDialog()
    if (!p) return
    const folder = p.slice(0, p.lastIndexOf('/')) || '/'
    await window.api.setLastProject(folder)
    openProject(folder, p)
  }

  const newProject = async () => {
    const r = await window.api.newProjectDialog()
    if (!r) return
    log('info', `New project created: ${r.dir}`)
    openProject(r.dir, r.files[0])
  }

  const openFolder = async () => {
    const d = await window.api.openFolderDialog()
    if (d) openProject(d)
  }

  const openFile = async (path: string, line?: number, col = 1) => {
    if (!tabs.some((t) => t.path === path)) {
      const content = await window.api.readFile(path)
      setTabs((ts) => (ts.some((t) => t.path === path) ? ts : [...ts, { path, content, saved: content }]))
    }
    setActive(path)
    if (line) setReveal({ line, col, nonce: Date.now() })
  }

  const closeTab = (path: string) => {
    const t = tabs.find((x) => x.path === path)
    if (t && t.content !== t.saved && !confirm(`${path.split('/').pop()} has unsaved changes. Close anyway?`)) return
    const rest = tabs.filter((x) => x.path !== path)
    setTabs(rest)
    if (active === path) setActive(rest[rest.length - 1]?.path ?? WAVE_TAB)
  }

  const dirty = useMemo(() => new Set(tabs.filter((t) => t.content !== t.saved).map((t) => t.path)), [tabs])

  const saveTabs = async (which: Tab[]) => {
    for (const t of which) {
      await window.api.writeFile(t.path, t.content)
      log('info', `Saved ${t.path.split('/').pop()}`)
    }
    if (which.length) {
      const saved = new Map(which.map((t) => [t.path, t.content]))
      setTabs((ts) => ts.map((t) => (saved.has(t.path) ? { ...t, saved: saved.get(t.path)! } : t)))
      setCompiledOk(false)
      await refresh()
    }
  }

  const saveActive = () => {
    const t = tabs.find((x) => x.path === active)
    if (t) saveTabs([t])
  }

  const [ask, setAsk] = useState<{ title: React.ReactNode; value: string; ok: string; onOk: (v: string) => void } | null>(null)

  /** Right-click → Force… on a wave signal (top-level inputs only). */
  const forceDialog = (key: string, width: number) => {
    const name = key.split('/').pop()!.toLowerCase()
    const ent = allEntities.find((e) => e.name === top)
    if (key.split('/').length !== 3 || !ent?.inputs.includes(name)) {
      log('err', `** Error: only input ports of ${top} can be forced (${ent?.inputs.join(', ') || 'none'}).`)
      return
    }
    const cur = [...forces].reverse().find((f) => f.signal === name)
    const isClock = width === 1 && /cl(oc)?k/i.test(name)
    const value = cur ? describeForce({ ...cur, start: 0 }).replace(/^force \S+ /, '') : isClock ? '0 0, 1 50 ns -repeat 100 ns' : width === 1 ? '0' : '0'.repeat(width)
    setAsk({
      title: (
        <>
          Force <code>{name}</code>{simTime ? <> from {formatTime(simTime)}</> : null}: value [time][, value time]… [-repeat period]
          <div className="dim">ex.: <code>1</code> · <code>0 0, 1 50 ns -repeat 100 ns</code> · <code>0101</code> · <code>16#9</code></div>
        </>
      ),
      value,
      ok: 'Force',
      onOk: (v) => v.trim() && runCommand(`force ${name} ${v.trim()}`)
    })
  }
  const newFile = async () => {
    if (!dir) return openFolder()
    setAsk({ title: <>New VHDL file (e.g. <code>alu.vhd</code> or <code>alu_tb.vhd</code>)</>, value: '', ok: 'Create', onOk: createFile })
  }
  const createFile = async (name: string) => {
    if (!dir || !name.trim()) return
    try {
      const p = await window.api.createFile(dir, name.trim())
      await refresh()
      openFile(p)
    } catch (e) {
      log('err', String(e))
    }
  }

  // ---------- file context menu (right click in the project panel) ----------
  const movePath = (from: string, to: string | null) => {
    setTabs((ts) => (to ? ts.map((t) => (t.path === from ? { ...t, path: to } : t)) : ts.filter((t) => t.path !== from)))
    setActive((a) => (a === from ? to ?? WAVE_TAB : a))
    setStatus((s) => {
      const n = { ...s }
      delete n[from]
      return n
    })
    setDiagnostics((ds) => ds.filter((d) => d.file !== from))
    setCompiledOk(false)
  }

  const fileMenu = async (f: ProjectFile) => {
    const tb = (f.entities.find((e) => e.top) ?? f.entities[0])?.name ?? null
    const action = await window.api.fileContextMenu(f.path, tb && tb !== top ? tb : null)
    const name = f.path.split('/').pop()!
    try {
      switch (action) {
        case 'open':
          openFile(f.path)
          break
        case 'set-top':
          if (tb) {
            setTop(tb)
            setSimTime(0)
            setVcd(null)
            setWaves([])
            log('info', `Top-level set to ${tb}.`)
          }
          break
        case 'rename':
          setAsk({
            title: <>Rename <code>{name}</code></>,
            value: name,
            ok: 'Rename',
            onOk: async (v) => {
              try {
                const to = await window.api.renameFile(f.path, v)
                if (to !== f.path) {
                  movePath(f.path, to)
                  log('info', `Renamed ${name} → ${to.split('/').pop()}`)
                  await refresh()
                }
              } catch (e) {
                log('err', String(e).replace(/^Error: (Error invoking remote method '\w+': )?(Error: )?/, ''))
              }
            }
          })
          break
        case 'duplicate': {
          const p = await window.api.duplicateFile(f.path)
          log('info', `Duplicated ${name} → ${p.split('/').pop()}`)
          await refresh()
          openFile(p)
          break
        }
        case 'copy-path':
          log('info', `Copied path: ${f.path}`)
          break
        case 'trash':
          if (await window.api.trashFile(f.path)) {
            movePath(f.path, null)
            log('info', `Moved ${name} to the Trash.`)
            await refresh()
          }
          break
      }
    } catch (e) {
      log('err', String(e))
    }
  }

  // ---------- compile / simulate ----------
  const compile = async (): Promise<boolean> => {
    if (!dir || busy) return false
    await saveTabs(tabs.filter((t) => t.content !== t.saved))
    const list = (await refresh()) ?? files
    if (!list.length) {
      log('err', 'No VHDL files to compile.')
      return false
    }
    setBusy('Compiling…')
    try {
      const r = await window.api.compile(dir, list.map((f) => f.path), std)
      setDiagnostics(r.diagnostics)
      const st: Record<string, FileStatus> = {}
      for (const f of list) {
        const ds = r.diagnostics.filter((d) => d.file === f.path)
        st[f.path] = r.failed.includes(f.path) ? 'error' : ds.some((d) => d.severity === 'warning') ? 'warning' : 'ok'
      }
      setStatus(st)
      setCompiledOk(r.ok)
      // jump to the first error
      const firstErr = r.diagnostics.find((d) => d.severity === 'error')
      if (firstErr) openFile(firstErr.file, firstErr.line, firstErr.col)
      return r.ok
    } finally {
      setBusy(null)
    }
  }

  const loadVcd = async (path: string, title: string, topName?: string, forced = false) => {
    const text = await window.api.readFile(path)
    const data = forced && topName ? unwrapForce(parseVcd(text), topName) : parseVcd(text)
    setVcd(data)
    setVcdTitle(title)
    setWaves((ws) => {
      const keys = new Set(data.signals.map(signalKey))
      const kept = ws.filter((w) => keys.has(w.key))
      if (kept.length) return kept
      // default: all signals of the top instance ("add wave *")
      const scopeName = topName ?? data.signals.find((s) => s.scope.length)?.scope[0]
      const sigs = data.signals.filter((s) => s.scope.length === 1 && s.scope[0] === scopeName)
      const pick = sigs.length ? sigs : data.signals.slice(0, 50)
      return pick.map((s) => ({ key: signalKey(s), radix: defaultRadix(s.width) }))
    })
    setActive(WAVE_TAB)
    return data
  }

  const simulate = async (mode: 'step' | 'all', lengthFs?: number) => {
    if (!dir || busy) return
    if (!top) {
      log('err', '** Error: no top-level entity selected (use the Top selector or "vsim <entity>").')
      return
    }
    if (!compiledOk || dirty.size) {
      const ok = await compile()
      if (!ok) return
    }
    let target: number | 'all' = 'all'
    if (mode === 'step') {
      const len = lengthFs ?? parseTime(runLength)
      if (!len) {
        log('err', `** Error: invalid run length "${runLength}" (e.g. 100 ns, 1 us).`)
        return
      }
      target = simTime + len
    }
    if (target === 'all' && forces.some((f) => f.repeat)) {
      log('err', '** Error: run -all never ends while a force uses -repeat (the clock keeps running). Use run <time>, e.g. run 1 us.')
      return
    }
    const ent = allEntities.find((e) => e.name === top)
    const forcedNames = new Set(forces.map((f) => f.signal))
    const undriven = ent?.inputs.filter((i) => !forcedNames.has(i)) ?? []
    if (undriven.length && !forces.length) {
      const tops = allEntities.filter((e) => e.top).map((e) => e.name)
      log('warn', `** Warning: top "${top}" has input ports that nothing drives (${undriven.join(', ')}): they stay 'U' and nothing happens.`)
      log('warn', `   Drive them with force (e.g. "force ${undriven[0]} 0 0, 1 50 -repeat 100", or right-click the signal → Force…)` +
        (tops.length ? `, or simulate a testbench: ${tops.join(', ')}.` : ', or write a testbench.'))
    } else if (undriven.length) {
      log('warn', `** Warning: inputs not forced (stay 'U'): ${undriven.join(', ')}`)
    }
    setBusy(mode === 'all' ? 'Running -all…' : `Running to ${formatTime(target as number)}…`)
    try {
      const r = await window.api.simulate(dir, top, target, std, forces)
      if (r.ok && r.vcdPath) {
        const data = await loadVcd(r.vcdPath, `${top} — ${r.vcdPath.split('/').pop()}${r.forced ? ' (forced)' : ''}`, top, r.forced)
        setSimTime(target === 'all' ? data.endTime * data.timescaleFs : target)
        if (target === 'all' && data.endTime === 0)
          log('warn', '** Warning: simulation ended at 0 ns — no events were scheduled (no clock/stimulus). Check the Top selection.')
      }
    } finally {
      setBusy(null)
    }
  }

  const restart = () => {
    setSimTime(0)
    setVcd(null)
    log('cmd', 'restart')
    log('info', `Simulation time reset to 0 ns. Wave signals${forces.length ? ' and forces' : ''} kept.`)
  }

  const breakSim = async () => {
    const stopped = await window.api.stop()
    log(stopped ? 'warn' : 'info', stopped ? 'Break requested.' : 'Nothing is running.')
  }

  const openVcd = async () => {
    const p = await window.api.openVcdDialog()
    if (!p) return
    setWaves([])
    log('cmd', `vsim -view ${p}`)
    try {
      await loadVcd(p, p.split('/').pop() ?? p)
    } catch (e) {
      log('err', `Could not read VCD: ${e}`)
    }
  }

  // ---------- transcript commands ----------
  const allEntities = useMemo(() => {
    const all = files.flatMap((f) => f.entities)
    return [...all.filter((e) => e.top), ...all.filter((e) => !e.top)]
  }, [files])

  const runCommand = (raw: string) => {
    const [cmd, ...args] = raw.trim().split(/\s+/)
    const c = cmd.toLowerCase()
    if (c !== 'clear') log('cmd', raw)
    switch (c) {
      case 'help':
        HELP.forEach((h) => log('info', h))
        break
      case 'clear':
        setLogs([])
        break
      case 'vcom':
        compile()
        break
      case 'vsim': {
        const name = args.filter((a) => !a.startsWith('-'))[0]?.replace(/^work\./i, '').toLowerCase()
        if (!name) return log('err', 'Usage: vsim <entity>')
        if (!allEntities.some((e) => e.name === name)) log('warn', `Entity "${name}" not found in project files (using it anyway).`)
        setTop(name)
        setSimTime(0)
        setVcd(null)
        setWaves([])
        log('info', `Top-level set to ${name}. Use "run" to simulate.`)
        break
      }
      case 'run': {
        if (args[0] === '-all' || args[0] === '-a' || args[0] === 'all') simulate('all')
        else if (args.length) {
          const t = parseTime(args.join(' '))
          if (t === null) log('err', `Invalid time "${args.join(' ')}".`)
          else simulate('step', t)
        } else simulate('step')
        break
      }
      case 'restart':
        restart()
        break
      case 'break':
        breakSim()
        break
      case 'add':
      case 'delete': {
        if (args[0]?.toLowerCase() !== 'wave') return log('err', `Usage: ${c} wave <pattern>`)
        const pat = args.slice(1).join(' ') || '*'
        if (c === 'delete') {
          setWaves([])
          break
        }
        if (!vcd) return log('err', 'No simulation data yet — run first.')
        const re = new RegExp(
          '^' +
            (pat.startsWith('/') ? pat : `/${top}/${pat}`)
              .split('*')
              .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
              .join('[^/]*') +
            '$',
          'i'
        )
        const found = vcd.signals.filter((s) => re.test(signalKey(s)))
        if (!found.length) return log('warn', `No signals match ${pat}.`)
        setWaves((ws) => {
          const have = new Set(ws.map((w) => w.key))
          return [...ws, ...found.filter((s) => !have.has(signalKey(s))).map((s) => ({ key: signalKey(s), radix: defaultRadix(s.width) }))]
        })
        setActive(WAVE_TAB)
        break
      }
      case 'radix': {
        const map: Record<string, Radix> = { bin: 'bin', binary: 'bin', hex: 'hex', hexadecimal: 'hex', unsigned: 'unsigned', dec: 'unsigned', decimal: 'signed', signed: 'signed' }
        const rx = map[(args[args.length - 1] ?? '').toLowerCase()]
        if (!rx) return log('err', 'Usage: radix <bin|hex|unsigned|signed>')
        setWaves((ws) => ws.map((w) => ({ ...w, radix: rx })))
        break
      }
      case 'force': {
        if (!args.length) {
          if (!forces.length) log('info', 'No active forces.')
          forces.forEach((f) => log('info', describeForce(f)))
          break
        }
        if (!top) return log('err', 'Select a top-level entity first.')
        const f = parseForce(args.join(' '), simTime)
        if (typeof f === 'string') return log('err', `** Error: ${f}`)
        const ent = allEntities.find((e) => e.name === top)
        if (ent && !ent.inputs.includes(f.signal)) {
          return log('err', `** Error: "${f.signal}" is not an input port of ${top}. Only top-level inputs can be forced (${ent.inputs.join(', ') || 'none'}).`)
        }
        // a new force replaces the old ones on that signal from now on (ModelSim semantics)
        setForces((fs) => [...fs.filter((x) => !(x.signal === f.signal && x.start >= f.start)), f])
        log('info', `Forced ${f.signal}${simTime ? ` from ${formatTime(simTime)}` : ''}. Takes effect on the next run.`)
        break
      }
      case 'noforce': {
        const names = args.map((a) => a.split('/').filter(Boolean).pop()!.toLowerCase())
        if (!names.length) return log('err', 'Usage: noforce <signal> | noforce *')
        const all = names.includes('*')
        setForces((fs) => fs.filter((f) => !all && !names.includes(f.signal)))
        log('info', all ? 'All forces removed.' : `Force removed: ${names.join(', ')}.`)
        break
      }
      case 'std':
        if (args[0] === '08' || args[0] === '93c') {
          setStd(args[0])
          setCompiledOk(false)
        } else log('err', 'Usage: std <08|93c>')
        break
      default:
        log('err', `Unknown command "${cmd}". Type "help".`)
    }
  }

  // ---------- menu ----------
  const handlers = useRef<Record<MenuAction, () => void>>({} as never)
  handlers.current = {
    'new-project': () => void newProject(),
    'open-folder': openFolder,
    'open-file': () => void openSingleFile(),
    'open-vcd': openVcd,
    save: saveActive,
    compile: () => void compile(),
    run: () => void simulate('step'),
    'run-all': () => void simulate('all'),
    restart,
    break: () => void breakSim(),
    'new-file': () => void newFile()
  }
  useEffect(() => window.api.onMenu((a) => handlers.current[a]?.()), [])

  // ---------- resizers ----------
  const drag = (axis: 'x' | 'y') => (e: React.MouseEvent) => {
    e.preventDefault()
    const start = axis === 'x' ? e.clientX : e.clientY
    const init = axis === 'x' ? leftW : bottomH
    const move = (ev: MouseEvent) => {
      if (axis === 'x') setLeftW(Math.min(500, Math.max(160, init + ev.clientX - start)))
      else setBottomH(Math.min(window.innerHeight - 200, Math.max(80, init - (ev.clientY - start))))
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const activeTab = tabs.find((t) => t.path === active)
  const errCount = diagnostics.filter((d) => d.severity === 'error').length

  return (
    <div className="app" style={{ gridTemplateColumns: `${leftW}px 4px 1fr`, gridTemplateRows: `44px 1fr 4px ${bottomH}px 22px` }}>
      <header className="toolbar">
        <button onClick={openFolder} title="Open project folder (⌘O)">📂 Open Folder</button>
        <button onClick={openSingleFile} title="Add .vhd/.vhdl files to this project — files from other folders are copied in (⌥⌘O)">📝 Open File</button>
        <button onClick={newFile} disabled={!dir} title="New VHDL file (⌘N)">📄 New</button>
        <button onClick={saveActive} disabled={!activeTab || !dirty.has(activeTab.path)} title="Save (⌘S)">💾 Save</button>
        <span className="sep" />
        <button onClick={() => compile()} disabled={!dir || !!busy} title="Compile all (⌘B)">⚙︎ Compile All</button>
        <select value={std} onChange={(e) => { setStd(e.target.value as Std); setCompiledOk(false) }} title="VHDL standard">
          <option value="08">VHDL-2008</option>
          <option value="93c">VHDL-93</option>
        </select>
        <span className="sep" />
        <label className="lbl">Top</label>
        <select value={top} onChange={(e) => { setTop(e.target.value); setSimTime(0); setVcd(null); setWaves([]) }} title="Top-level entity / testbench">
          {!allEntities.length && <option value="">—</option>}
          {allEntities.map((e) => (
            <option key={e.name} value={e.name}>
              {e.name}
              {e.top ? ' (top)' : ''}
            </option>
          ))}
        </select>
        <input className="runlen" value={runLength} onChange={(e) => setRunLength(e.target.value)} title="Run length" onKeyDown={(e) => e.key === 'Enter' && simulate('step')} />
        <button onClick={() => simulate('step')} disabled={!dir || !!busy} title="Run (F9)">▶ Run</button>
        <button onClick={() => simulate('all')} disabled={!dir || !!busy} title="Run -All (⇧F9)">⏩ Run -All</button>
        <button onClick={breakSim} disabled={!busy} title="Break (⌘.)">⏹ Break</button>
        <button onClick={restart} disabled={!dir} title="Restart (⌘R)">⟲ Restart</button>
        <span className="sep" />
        <button onClick={openVcd} title="Open a .vcd waveform file (⇧⌘O)">〰 Open VCD</button>
        <span className="spacer" />
        <span className="now">Now: {formatTime(simTime)}</span>
      </header>

      <aside className="left">
        <ProjectPanel
          dir={dir}
          files={files}
          status={status}
          active={active}
          dirty={dirty}
          onOpen={(p) => openFile(p)}
          onContextMenu={fileMenu}
          onOpenFolder={openFolder}
          onNewProject={newProject}
          onOpenFile={openSingleFile}
          onNewFile={newFile}
          onRefresh={() => refresh()}
        />
      </aside>
      <div className="resizer x" onMouseDown={drag('x')} />

      <main className="center">
        <div className="tabs">
          <div className={'tab wave-tab' + (active === WAVE_TAB ? ' active' : '')} onClick={() => setActive(WAVE_TAB)}>
            〰 Wave
          </div>
          {tabs.map((t) => (
            <div key={t.path} className={'tab' + (active === t.path ? ' active' : '')} onClick={() => setActive(t.path)} title={t.path}>
              {t.path.split('/').pop()}
              {t.content !== t.saved ? ' •' : ''}
              <span
                className="close"
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(t.path)
                }}
              >
                ×
              </span>
            </div>
          ))}
        </div>
        <div className="content">
          <div className="pane" style={{ display: active === WAVE_TAB ? 'flex' : 'none' }}>
            <Waveform
              data={vcd}
              waves={waves}
              onWavesChange={setWaves}
              title={vcdTitle}
              forced={new Set(forces.map((f) => `/${top}/${f.signal}`))}
              onForce={forceDialog}
              onNoForce={(key: string) => runCommand(`noforce ${key.split('/').pop()}`)}
            />
          </div>
          {activeTab && (
            <div className="pane">
              <EditorPane
                path={activeTab.path}
                value={activeTab.content}
                diagnostics={diagnostics}
                reveal={reveal}
                onChange={(v) => setTabs((ts) => ts.map((t) => (t.path === activeTab.path ? { ...t, content: v } : t)))}
              />
            </div>
          )}
        </div>
      </main>

      <div className="resizer y" onMouseDown={drag('y')} />
      <section className="bottom">
        <Transcript lines={logs} prompt={vcd ? 'VSIM>' : 'ModelSim>'} onCommand={runCommand} onJump={(f, l, c) => openFile(f, l, c)} />
      </section>

      {ask && (
        <div className="modal-back" onMouseDown={() => setAsk(null)}>
          <form
            className="modal"
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault()
              setAsk(null)
              ask.onOk(ask.value)
            }}
          >
            <div>{ask.title}</div>
            <input
              autoFocus
              value={ask.value}
              onFocus={(e) => {
                // select the name without the extension, like Finder
                const dot = e.target.value.lastIndexOf('.')
                e.target.setSelectionRange(0, dot > 0 ? dot : e.target.value.length)
              }}
              onChange={(e) => setAsk({ ...ask, value: e.target.value })}
              onKeyDown={(e) => e.key === 'Escape' && setAsk(null)}
            />
            <div className="modal-actions">
              <button type="button" onClick={() => setAsk(null)}>Cancel</button>
              <button type="submit" className="primary">{ask.ok}</button>
            </div>
          </form>
        </div>
      )}

      <footer className="statusbar">
        <span>{busy ?? 'Ready'}</span>
        <span className="spacer" />
        {diagnostics.length > 0 && <span className={errCount ? 'err' : 'warn'}>Errors: {errCount} · Warnings: {diagnostics.length - errCount}</span>}
        <span>Top: {top || '—'}</span>
        <span>{std === '08' ? 'VHDL-2008' : 'VHDL-93'}</span>
        <span className={ghdl.path ? '' : 'err'} title={ghdl.path ?? ''}>{ghdl.path ? ghdl.version ?? 'GHDL' : 'GHDL not found'}</span>
      </footer>
    </div>
  )
}
