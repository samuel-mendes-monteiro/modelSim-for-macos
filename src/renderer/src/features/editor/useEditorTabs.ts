/** Open editor tabs, the active tab (or the Wave tab) and saving. */
import { useMemo, useState } from 'react'
import { api } from '../../services/api'
import type { Log } from '../transcript/useTranscript'

export const WAVE_TAB = '__wave__'

export interface Tab {
  path: string
  content: string
  /** content on disk; the tab is dirty when they differ */
  saved: string
}

const fileName = (p: string) => p.split('/').pop()

export function useEditorTabs(log: Log) {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [active, setActive] = useState<string>(WAVE_TAB)
  const [reveal, setReveal] = useState<{ line: number; col: number; nonce: number } | null>(null)

  const dirty = useMemo(() => new Set(tabs.filter((t) => t.content !== t.saved).map((t) => t.path)), [tabs])
  const activeTab = tabs.find((t) => t.path === active)

  /** Open (or focus) a file, optionally scrolling to a line. */
  const openFile = async (path: string, line?: number, col = 1) => {
    if (!tabs.some((t) => t.path === path)) {
      const content = await api.readFile(path)
      setTabs((ts) => (ts.some((t) => t.path === path) ? ts : [...ts, { path, content, saved: content }]))
    }
    setActive(path)
    if (line) setReveal({ line, col, nonce: Date.now() })
  }

  const closeTab = (path: string) => {
    const t = tabs.find((x) => x.path === path)
    if (t && t.content !== t.saved && !confirm(`${fileName(path)} has unsaved changes. Close anyway?`)) return
    const rest = tabs.filter((x) => x.path !== path)
    setTabs(rest)
    if (active === path) setActive(rest[rest.length - 1]?.path ?? WAVE_TAB)
  }

  const edit = (path: string, content: string) => setTabs((ts) => ts.map((t) => (t.path === path ? { ...t, content } : t)))

  /** Write tabs to disk. Returns how many were saved. */
  const save = async (which: Tab[]): Promise<number> => {
    for (const t of which) {
      await api.writeFile(t.path, t.content)
      log('info', `Saved ${fileName(t.path)}`)
    }
    if (which.length) {
      const saved = new Map(which.map((t) => [t.path, t.content]))
      setTabs((ts) => ts.map((t) => (saved.has(t.path) ? { ...t, saved: saved.get(t.path)! } : t)))
    }
    return which.length
  }

  const unsaved = () => tabs.filter((t) => t.content !== t.saved)

  /** A file was renamed (`to`) or deleted (`to` = null). */
  const movePath = (from: string, to: string | null) => {
    setTabs((ts) => (to ? ts.map((t) => (t.path === from ? { ...t, path: to } : t)) : ts.filter((t) => t.path !== from)))
    setActive((a) => (a === from ? to ?? WAVE_TAB : a))
  }

  const reset = () => {
    setTabs([])
    setActive(WAVE_TAB)
  }

  return { tabs, active, setActive, activeTab, dirty, reveal, openFile, closeTab, edit, save, unsaved, movePath, reset }
}
