/**
 * Compile → simulate → load waveform. Owns the simulation state (time, busy flag, last VCD,
 * diagnostics) and the force commands; talks to GHDL through the api service.
 */
import { useState } from 'react'
import type { EntityInfo, Diagnostic, ProjectFile, Std } from '@shared/project'
import { addForce, describeForce, parseForce, removeForces, unwrapForcedVcd, type ForceCmd } from '@shared/simulation/force'
import { formatTime, parseTime } from '@shared/waveform/time'
import { parseVcd, type VcdData } from '@shared/waveform/vcd'
import { api, errorMessage } from '../../services/api'
import type { FileStatus } from '../project/ProjectPanel'
import type { Log } from '../transcript/useTranscript'
import { itemsForData, type WaveItem } from '../waveform/waveItems'
import { forceError, RUN_ALL_WITH_REPEAT, undrivenWarnings } from './checks'

export interface SimulationDeps {
  log: Log
  dir: string | null
  top: string
  topEntity: EntityInfo | undefined
  entities: EntityInfo[]
  files: ProjectFile[]
  refreshFiles: () => Promise<ProjectFile[]>
  /** save unsaved editor tabs; returns how many were saved */
  saveEditors: () => Promise<number>
  hasUnsaved: boolean
  openAt: (file: string, line: number, col: number) => void
  showWave: () => void
  session: {
    forces: ForceCmd[]
    setForces: (f: ForceCmd[] | ((f: ForceCmd[]) => ForceCmd[])) => void
    setWaves: (w: WaveItem[] | ((w: WaveItem[]) => WaveItem[])) => void
  }
}

export function useSimulation(d: SimulationDeps) {
  const [std, setStdState] = useState<Std>('08')
  const [compiledOk, setCompiledOk] = useState(false)
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([])
  const [status, setStatus] = useState<Record<string, FileStatus>>({})
  const [runLength, setRunLength] = useState('100 ns')
  const [simTime, setSimTime] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [vcd, setVcd] = useState<VcdData | null>(null)
  const [vcdTitle, setVcdTitle] = useState('')
  const { log, session } = d

  /** Sources changed: the next run recompiles. */
  const invalidate = () => setCompiledOk(false)

  const setStd = (s: Std) => {
    setStdState(s)
    invalidate()
  }

  /** Forget everything about a project (new folder opened). */
  const reset = () => {
    setDiagnostics([])
    setStatus({})
    setCompiledOk(false)
    setSimTime(0)
    setVcd(null)
    session.setWaves([])
  }

  /** The top changed: start a fresh simulation with an empty wave list. */
  const resetRun = () => {
    setSimTime(0)
    setVcd(null)
    session.setWaves([])
  }

  /** A file was renamed or deleted. */
  const forgetFile = (path: string) => {
    setStatus((s) => {
      const n = { ...s }
      delete n[path]
      return n
    })
    setDiagnostics((ds) => ds.filter((x) => x.file !== path))
    invalidate()
  }

  // ---------- compile ----------
  const compile = async (): Promise<boolean> => {
    if (!d.dir || busy) return false
    if (await d.saveEditors()) invalidate()
    const list = (await d.refreshFiles()) ?? d.files
    if (!list.length) {
      log('err', 'No VHDL files to compile.')
      return false
    }
    setBusy('Compiling…')
    try {
      const r = await api.compile(d.dir, list.map((f) => f.path), std)
      setDiagnostics(r.diagnostics)
      const st: Record<string, FileStatus> = {}
      for (const f of list) {
        const ds = r.diagnostics.filter((x) => x.file === f.path)
        st[f.path] = r.failed.includes(f.path) ? 'error' : ds.some((x) => x.severity === 'warning') ? 'warning' : 'ok'
      }
      setStatus(st)
      setCompiledOk(r.ok)
      const firstErr = r.diagnostics.find((x) => x.severity === 'error')
      if (firstErr) d.openAt(firstErr.file, firstErr.line, firstErr.col)
      return r.ok
    } finally {
      setBusy(null)
    }
  }

  // ---------- waveform ----------
  const loadVcd = async (path: string, title: string, top?: string, forced = false) => {
    const raw = parseVcd(await api.readFile(path))
    const data = forced && top ? unwrapForcedVcd(raw, top) : raw
    setVcd(data)
    setVcdTitle(title)
    session.setWaves((ws) => itemsForData(ws, data, top))
    d.showWave()
    return data
  }

  const openVcd = async () => {
    const p = await api.openVcdDialog()
    if (!p) return
    session.setWaves([])
    log('cmd', `vsim -view ${p}`)
    try {
      await loadVcd(p, p.split('/').pop() ?? p)
    } catch (e) {
      log('err', `Could not read VCD: ${errorMessage(e)}`)
    }
  }

  // ---------- run ----------
  /** `run` (step: by `lengthFs` or the toolbar run length) or `run -all`. */
  const run = async (mode: 'step' | 'all', lengthFs?: number) => {
    if (!d.dir || busy) return
    const { top, forces } = { top: d.top, forces: session.forces }
    if (!top) {
      log('err', '** Error: no top-level entity selected (use the Top selector or "vsim <entity>").')
      return
    }
    if (!compiledOk || d.hasUnsaved) {
      if (!(await compile())) return
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
      log('err', RUN_ALL_WITH_REPEAT)
      return
    }
    const tops = d.entities.filter((e) => e.top).map((e) => e.name)
    for (const w of undrivenWarnings(d.topEntity, forces, tops)) log('warn', w)

    setBusy(target === 'all' ? 'Running -all…' : `Running to ${formatTime(target)}…`)
    try {
      const r = await api.simulate(d.dir, top, target, std, forces)
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
    log('info', `Simulation time reset to 0 ns. Wave signals${session.forces.length ? ' and forces' : ''} kept.`)
  }

  const breakRun = async () => {
    const stopped = await api.stop()
    log(stopped ? 'warn' : 'info', stopped ? 'Break requested.' : 'Nothing is running.')
  }

  // ---------- force ----------
  const listForces = () => {
    if (!session.forces.length) log('info', 'No active forces.')
    session.forces.forEach((f) => log('info', describeForce(f)))
  }

  /** `force <args>`: applies from the current simulation time on the next run. */
  const force = (args: string) => {
    if (!d.top) return log('err', 'Select a top-level entity first.')
    const f = parseForce(args, simTime)
    if (typeof f === 'string') return log('err', `** Error: ${f}`)
    const err = forceError(f.signal, d.topEntity)
    if (err) return log('err', err)
    session.setForces((fs) => addForce(fs, f))
    log('info', `Forced ${f.signal}${simTime ? ` from ${formatTime(simTime)}` : ''}. Takes effect on the next run.`)
  }

  const noforce = (names: string[]) => {
    session.setForces((fs) => removeForces(fs, names))
    log('info', names.includes('*') ? 'All forces removed.' : `Force removed: ${names.join(', ')}.`)
  }

  return {
    std,
    setStd,
    compiledOk,
    diagnostics,
    status,
    runLength,
    setRunLength,
    simTime,
    busy,
    vcd,
    vcdTitle,
    invalidate,
    reset,
    resetRun,
    forgetFile,
    compile,
    run,
    restart,
    breakRun,
    openVcd,
    listForces,
    force,
    noforce
  }
}
