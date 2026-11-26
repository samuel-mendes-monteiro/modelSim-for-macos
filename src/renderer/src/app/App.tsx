/**
 * Root component. It composes the feature hooks, connects them where one feature needs another
 * (e.g. compiling saves the editors), executes Transcript commands and lays out the window.
 * Feature logic lives in features/*; this file should only wire and render.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { GhdlStatus, MenuAction } from '@shared/contract'
import type { ProjectFile } from '@shared/project'
import { formatTime } from '@shared/waveform/time'
import { api, errorMessage } from '../services/api'
import EditorPane from '../features/editor/EditorPane'
import { useEditorTabs, WAVE_TAB } from '../features/editor/useEditorTabs'
import ProjectPanel from '../features/project/ProjectPanel'
import { useProject } from '../features/project/useProject'
import { suggestedForceValue } from '../features/simulation/checks'
import { useSession } from '../features/simulation/useSession'
import { useSimulation } from '../features/simulation/useSimulation'
import { parseCommand, type Command } from '../features/transcript/commands'
import { HELP } from '../features/transcript/help'
import Transcript from '../features/transcript/Transcript'
import { useTranscript } from '../features/transcript/useTranscript'
import Waveform from '../features/waveform/Waveform'
import { addSignals, matchSignals, setRadixAll } from '../features/waveform/waveItems'
import PromptDialog, { type Prompt } from './PromptDialog'
import StatusBar from './StatusBar'
import Toolbar from './Toolbar'
import { useSplitters } from './useSplitters'

const fileName = (p: string) => p.split('/').pop()!

export default function App() {
  const { lines, log, clear } = useTranscript()
  const project = useProject()
  const editor = useEditorTabs(log)
  const session = useSession(project.dir, project.top, log)
  const sim = useSimulation({
    log,
    dir: project.dir,
    top: project.top,
    topEntity: project.topEntity,
    entities: project.entities,
    files: project.files,
    refreshFiles: () => project.refresh(),
    saveEditors: () => saveEditors(editor.unsaved()),
    hasUnsaved: editor.dirty.size > 0,
    openAt: (f, l, c) => void editor.openFile(f, l, c),
    showWave: () => editor.setActive(WAVE_TAB),
    session
  })
  const { leftW, bottomH, drag } = useSplitters()
  const [prompt, setPrompt] = useState<Prompt | null>(null)
  const [ghdl, setGhdl] = useState<Pick<GhdlStatus, 'path' | 'version'>>({ path: null, version: null })

  // ---------- project ----------
  const saveEditors = async (tabs = editor.unsaved()) => {
    const n = await editor.save(tabs)
    if (n) {
      sim.invalidate()
      await project.refresh()
    }
    return n
  }

  const openProject = useCallback(
    async (d: string, fileToOpen?: string) => {
      editor.reset()
      sim.reset()
      const list = await project.open(d)
      log('info', `Project opened: ${d} (${list.length} VHDL file(s))`)
      const first = fileToOpen ?? (list.find((f) => f.kind === 'design') ?? list[0])?.path
      if (first) editor.openFile(first)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [log]
  )

  useEffect(() => {
    api.ghdlStatus().then((s) => {
      setGhdl(s)
      if (s.path) log('info', `${s.version ?? 'GHDL'} — ${s.path}`)
      else log('err', s.hint)
    })
    api.lastProject().then((p) => {
      if (p) openProject(p)
    })
  }, [log, openProject])

  const selectTop = (name: string) => {
    project.setTop(name)
    sim.resetRun()
  }

  const openFolder = async () => {
    const d = await api.openFolderDialog()
    if (d) openProject(d)
  }

  const newProject = async () => {
    const r = await api.newProjectDialog()
    if (!r) return
    log('info', `New project created: ${r.dir}`)
    openProject(r.dir, r.files[0])
  }

  /** With a project open: add files to it (copied in). Without: the file's folder becomes the project. */
  const openFileOrAdd = async () => {
    if (project.dir) {
      try {
        const added = await api.addFilesToProject(project.dir)
        if (!added.length) return
        for (const p of added) log('info', `Added to project: ${fileName(p)}`)
        sim.invalidate()
        await project.refresh()
        editor.openFile(added[added.length - 1])
      } catch (e) {
        log('err', errorMessage(e))
      }
      return
    }
    const p = await api.openFileDialog()
    if (!p) return
    const folder = p.slice(0, p.lastIndexOf('/')) || '/'
    await api.setLastProject(folder)
    openProject(folder, p)
  }

  const newFile = () => {
    if (!project.dir) return openFolder()
    setPrompt({
      title: <>New VHDL file (e.g. <code>alu.vhd</code> or <code>alu_tb.vhd</code>)</>,
      value: '',
      ok: 'Create',
      onOk: async (name) => {
        if (!project.dir || !name.trim()) return
        try {
          const p = await api.createFile(project.dir, name.trim())
          await project.refresh()
          editor.openFile(p)
        } catch (e) {
          log('err', errorMessage(e))
        }
      }
    })
  }

  const saveActive = () => {
    if (editor.activeTab) saveEditors([editor.activeTab])
  }

  /** A file was renamed (`to`) or moved to the Trash (`to` = null). */
  const movePath = (from: string, to: string | null) => {
    editor.movePath(from, to)
    sim.forgetFile(from)
  }

  const fileMenu = async (f: ProjectFile) => {
    const tb = (f.entities.find((e) => e.top) ?? f.entities[0])?.name ?? null
    const action = await api.fileContextMenu(f.path, tb && tb !== project.top ? tb : null)
    const name = fileName(f.path)
    try {
      switch (action) {
        case 'open':
          editor.openFile(f.path)
          break
        case 'set-top':
          if (tb) {
            selectTop(tb)
            log('info', `Top-level set to ${tb}.`)
          }
          break
        case 'rename':
          setPrompt({
            title: <>Rename <code>{name}</code></>,
            value: name,
            ok: 'Rename',
            onOk: async (v) => {
              try {
                const to = await api.renameFile(f.path, v)
                if (to !== f.path) {
                  movePath(f.path, to)
                  log('info', `Renamed ${name} → ${fileName(to)}`)
                  await project.refresh()
                }
              } catch (e) {
                log('err', errorMessage(e))
              }
            }
          })
          break
        case 'duplicate': {
          const p = await api.duplicateFile(f.path)
          log('info', `Duplicated ${name} → ${fileName(p)}`)
          await project.refresh()
          editor.openFile(p)
          break
        }
        case 'copy-path':
          log('info', `Copied path: ${f.path}`)
          break
        case 'trash':
          if (await api.trashFile(f.path)) {
            movePath(f.path, null)
            log('info', `Moved ${name} to the Trash.`)
            await project.refresh()
          }
          break
      }
    } catch (e) {
      log('err', errorMessage(e))
    }
  }

  /** Right-click → Force… on a wave signal (top-level inputs only). */
  const forceDialog = (key: string, width: number) => {
    const name = key.split('/').pop()!.toLowerCase()
    const ent = project.topEntity
    if (key.split('/').length !== 3 || !ent?.inputs.includes(name)) {
      log('err', `** Error: only input ports of ${project.top} can be forced (${ent?.inputs.join(', ') || 'none'}).`)
      return
    }
    setPrompt({
      title: (
        <>
          Force <code>{name}</code>
          {sim.simTime ? <> from {formatTime(sim.simTime)}</> : null}: value [time][, value time]… [-repeat period]
          <div className="dim">
            ex.: <code>1</code> · <code>0 0, 1 50 ns -repeat 100 ns</code> · <code>0101</code> · <code>16#9</code>
          </div>
        </>
      ),
      value: suggestedForceValue(name, width, session.forces),
      ok: 'Force',
      onOk: (v) => v.trim() && runCommand(`force ${name} ${v.trim()}`)
    })
  }

  // ---------- Transcript commands ----------
  const execute = (c: Command) => {
    switch (c.kind) {
      case 'help':
        return HELP.forEach((h) => log('info', h))
      case 'clear':
        return clear()
      case 'compile':
        return void sim.compile()
      case 'vsim':
        if (!project.entities.some((e) => e.name === c.entity)) log('warn', `Entity "${c.entity}" not found in project files (using it anyway).`)
        selectTop(c.entity)
        return log('info', `Top-level set to ${c.entity}. Use "run" to simulate.`)
      case 'run':
        return void (c.mode === 'all' ? sim.run('all') : sim.run('step', c.lengthFs))
      case 'restart':
        return sim.restart()
      case 'break':
        return void sim.breakRun()
      case 'delete-wave':
        return session.setWaves([])
      case 'add-wave': {
        if (!sim.vcd) return log('err', 'No simulation data yet — run first.')
        const found = matchSignals(c.pattern, project.top, sim.vcd.signals)
        if (!found.length) return log('warn', `No signals match ${c.pattern}.`)
        session.setWaves((ws) => addSignals(ws, found))
        return editor.setActive(WAVE_TAB)
      }
      case 'radix':
        return session.setWaves((ws) => setRadixAll(ws, c.radix))
      case 'list-forces':
        return sim.listForces()
      case 'force':
        return sim.force(c.args)
      case 'noforce':
        return sim.noforce(c.names)
      case 'std':
        return sim.setStd(c.std)
    }
  }

  const runCommand = (raw: string) => {
    const c = parseCommand(raw)
    if (!('kind' in c && c.kind === 'clear')) log('cmd', raw)
    if ('error' in c) log('err', c.error)
    else execute(c)
  }

  // ---------- native menu ----------
  const handlers = useRef<Record<MenuAction, () => void>>({} as never)
  handlers.current = {
    'new-project': () => void newProject(),
    'open-folder': () => void openFolder(),
    'open-file': () => void openFileOrAdd(),
    'open-vcd': () => void sim.openVcd(),
    save: saveActive,
    compile: () => void sim.compile(),
    run: () => void sim.run('step'),
    'run-all': () => void sim.run('all'),
    restart: sim.restart,
    break: () => void sim.breakRun(),
    'new-file': () => void newFile()
  }
  useEffect(() => api.onMenu((a) => handlers.current[a]?.()), [])

  // ---------- layout ----------
  const { activeTab } = editor
  return (
    <div className="app" style={{ gridTemplateColumns: `${leftW}px 4px 1fr`, gridTemplateRows: `44px 1fr 4px ${bottomH}px 22px` }}>
      <Toolbar
        hasProject={!!project.dir}
        canSave={!!activeTab && editor.dirty.has(activeTab.path)}
        busy={!!sim.busy}
        std={sim.std}
        top={project.top}
        entities={project.entities}
        runLength={sim.runLength}
        simTime={sim.simTime}
        onOpenFolder={openFolder}
        onOpenFile={openFileOrAdd}
        onNewFile={newFile}
        onSave={saveActive}
        onCompile={() => sim.compile()}
        onStd={sim.setStd}
        onTop={selectTop}
        onRunLength={sim.setRunLength}
        onRun={() => sim.run('step')}
        onRunAll={() => sim.run('all')}
        onBreak={sim.breakRun}
        onRestart={sim.restart}
        onOpenVcd={sim.openVcd}
      />

      <aside className="left">
        <ProjectPanel
          dir={project.dir}
          files={project.files}
          status={sim.status}
          active={editor.active}
          dirty={editor.dirty}
          onOpen={(p) => editor.openFile(p)}
          onContextMenu={fileMenu}
          onOpenFolder={openFolder}
          onNewProject={newProject}
          onOpenFile={openFileOrAdd}
          onNewFile={newFile}
          onRefresh={() => project.refresh()}
        />
      </aside>
      <div className="resizer x" onMouseDown={drag('x')} />

      <main className="center">
        <div className="tabs">
          <div className={'tab wave-tab' + (editor.active === WAVE_TAB ? ' active' : '')} onClick={() => editor.setActive(WAVE_TAB)}>
            〰 Wave
          </div>
          {editor.tabs.map((t) => (
            <div key={t.path} className={'tab' + (editor.active === t.path ? ' active' : '')} onClick={() => editor.setActive(t.path)} title={t.path}>
              {fileName(t.path)}
              {t.content !== t.saved ? ' •' : ''}
              <span
                className="close"
                onClick={(e) => {
                  e.stopPropagation()
                  editor.closeTab(t.path)
                }}
              >
                ×
              </span>
            </div>
          ))}
        </div>
        <div className="content">
          <div className="pane" style={{ display: editor.active === WAVE_TAB ? 'flex' : 'none' }}>
            <Waveform
              data={sim.vcd}
              waves={session.waves}
              onWavesChange={session.setWaves}
              title={sim.vcdTitle}
              forced={new Set(session.forces.map((f) => `/${project.top}/${f.signal}`))}
              onForce={forceDialog}
              onNoForce={(key) => runCommand(`noforce ${key.split('/').pop()}`)}
            />
          </div>
          {activeTab && (
            <div className="pane">
              <EditorPane
                path={activeTab.path}
                value={activeTab.content}
                diagnostics={sim.diagnostics}
                reveal={editor.reveal}
                onChange={(v) => editor.edit(activeTab.path, v)}
              />
            </div>
          )}
        </div>
      </main>

      <div className="resizer y" onMouseDown={drag('y')} />
      <section className="bottom">
        <Transcript lines={lines} prompt={sim.vcd ? 'VSIM>' : 'ModelSim>'} onCommand={runCommand} onJump={(f, l, c) => editor.openFile(f, l, c)} />
      </section>

      {prompt && <PromptDialog prompt={prompt} onChange={setPrompt} onClose={() => setPrompt(null)} />}

      <StatusBar busy={sim.busy} diagnostics={sim.diagnostics} top={project.top} std={sim.std} ghdl={ghdl} />
    </div>
  )
}
