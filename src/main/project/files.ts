/** Reading a project folder: find the VHDL files and classify them. */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { ProjectFile } from '@shared/project'
import { classifyFiles } from '@shared/vhdl/classify'
import { scanUnits } from '@shared/vhdl/scan'

/** Folders never searched for sources (build output, dependencies, our own .vhdlsim). */
const SKIP_DIRS = new Set(['node_modules', '.git', '.vhdlsim', 'out', 'dist'])
const MAX_DEPTH = 8

/** Absolute paths of all .vhd/.vhdl files under `dir` (recursive, hidden folders skipped). */
export function listVhdl(dir: string, depth = 0, acc: string[] = []): string[] {
  if (depth > MAX_DEPTH) return acc
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
    if (st.isDirectory()) listVhdl(p, depth + 1, acc)
    else if (/\.vhdl?$/i.test(name)) acc.push(p)
  }
  return acc
}

function readOrNull(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

export function listProject(dir: string): ProjectFile[] {
  const paths = listVhdl(dir).sort()
  return classifyFiles(paths.map((path) => ({ path, rel: relative(dir, path), text: readOrNull(path) })))
}

/** Source text of the file that declares `entity` (used to generate the force testbench). */
export function findEntitySource(dir: string, entity: string): string | null {
  for (const p of listVhdl(dir)) {
    const text = readOrNull(p)
    if (text && scanUnits(text).entities.some((e) => e.name === entity)) return text
  }
  return null
}
