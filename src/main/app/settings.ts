/** App preferences stored in userData/settings.json. */
import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

interface Settings {
  lastProject?: string
}

const settingsPath = () => join(app.getPath('userData'), 'settings.json')

function load(): Settings {
  try {
    return JSON.parse(readFileSync(settingsPath(), 'utf8'))
  } catch {
    return {}
  }
}

function save(s: Settings) {
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(settingsPath(), JSON.stringify(s))
  } catch {
    /* preferences are best effort */
  }
}

export function setLastProject(dir: string) {
  save({ ...load(), lastProject: dir })
}

/** Project to reopen at startup (VHDLSIM_PROJECT overrides it for automated checks). */
export function lastProject(): string | null {
  const p = process.env.VHDLSIM_PROJECT || load().lastProject
  return p && existsSync(p) ? p : null
}
