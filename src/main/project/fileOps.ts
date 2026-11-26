/** File operations on project files (no dialogs here: decisions are passed in as callbacks). */
import { existsSync, renameSync, copyFileSync, readFileSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, extname, basename, join } from 'node:path'
import { emptyEntity, projectTemplate } from './templates'

/** Create `name` (default extension .vhd) in `dir` with an empty entity. Returns its path. */
export function createVhdlFile(dir: string, name: string): string {
  const file = extname(name) ? name : `${name}.vhd`
  const p = join(dir, file)
  if (existsSync(p)) throw new Error(`${file} already exists`)
  writeFileSync(p, emptyEntity(basename(file, extname(file)).replace(/\W/g, '_')))
  return p
}

/** Create a project folder with the starter design + testbench. Refuses a non-empty folder. */
export function createProject(dir: string): string[] {
  if (existsSync(dir) && readdirSync(dir).length) throw new Error(`"${basename(dir)}" already exists and is not empty.`)
  mkdirSync(dir, { recursive: true })
  return projectTemplate(basename(dir)).map(([name, content]) => {
    const p = join(dir, name)
    writeFileSync(p, content)
    return p
  })
}

/** Rename a file inside its own folder. Keeps the extension when the new name has none. Returns the new path. */
export function renameFile(path: string, newName: string): string {
  const name = newName.trim()
  if (!name || name.includes('/') || name === '.' || name === '..') throw new Error(`Invalid file name "${newName}"`)
  const finalName = extname(name) ? name : name + extname(path)
  const dest = join(dirname(path), finalName)
  if (dest === path) return path
  // Allow case-only renames on case-insensitive APFS
  if (existsSync(dest) && dest.toLowerCase() !== path.toLowerCase()) throw new Error(`${finalName} already exists`)
  renameSync(path, dest)
  return dest
}

export type Conflict = 'replace' | 'keep-both' | 'skip'

/**
 * Bring `src` into project folder `dir`. Files already inside the folder are returned unchanged.
 * When a different file with the same name exists, `onConflict` decides. Returns the path inside
 * the project, or null when skipped.
 */
export function copyIntoProject(src: string, dir: string, onConflict: (name: string) => Conflict): string | null {
  const root = dir.endsWith('/') ? dir : dir + '/'
  if (src.startsWith(root)) return src
  const dest = join(dir, basename(src))
  if (existsSync(dest)) {
    if (readFileSync(dest).equals(readFileSync(src))) return dest
    const c = onConflict(basename(src))
    if (c === 'skip') return null
    if (c === 'keep-both') {
      const ext = extname(src)
      const base = basename(src, ext)
      let n = 2
      let alt = join(dir, `${base}_${n}${ext}`)
      while (existsSync(alt)) alt = join(dir, `${base}_${++n}${ext}`)
      copyFileSync(src, alt)
      return alt
    }
  }
  copyFileSync(src, dest)
  return dest
}

/** Copy `x.vhd` to `x_copy.vhd` (or `x_copy2.vhd`, …). Returns the new path. */
export function duplicateFile(path: string): string {
  const ext = extname(path)
  const base = basename(path, ext)
  let n = 1
  let dest = join(dirname(path), `${base}_copy${ext}`)
  while (existsSync(dest)) dest = join(dirname(path), `${base}_copy${++n}${ext}`)
  copyFileSync(path, dest)
  return dest
}
