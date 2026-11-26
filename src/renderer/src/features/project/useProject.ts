/** The open project: folder, classified files and the selected top entity. */
import { useCallback, useMemo, useState } from 'react'
import type { ProjectFile } from '@shared/project'
import { defaultTop, entitiesForTop } from '@shared/vhdl/classify'
import { api } from '../../services/api'

export function useProject() {
  const [dir, setDir] = useState<string | null>(null)
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [top, setTop] = useState('')

  /** Re-read the file list (after saves, renames, compiles). */
  const refresh = useCallback(
    async (d = dir): Promise<ProjectFile[]> => {
      if (!d) return []
      const list = await api.listProject(d)
      setFiles(list)
      return list
    },
    [dir]
  )

  /** Switch to folder `d` and pick a default top. Returns the file list. */
  const open = useCallback(async (d: string): Promise<ProjectFile[]> => {
    setDir(d)
    const list = await api.listProject(d)
    setFiles(list)
    setTop(defaultTop(list))
    return list
  }, [])

  /** Entities in Top-selector order (simulation tops first). */
  const entities = useMemo(() => entitiesForTop(files), [files])
  const topEntity = entities.find((e) => e.name === top)

  return { dir, files, top, setTop, topEntity, entities, refresh, open }
}
