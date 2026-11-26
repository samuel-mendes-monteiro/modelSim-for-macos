/**
 * Enforces the layer rules of docs/arquitetura.md. A failure here means an import goes in a
 * forbidden direction: move the code to the right layer instead of weakening the rule.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(__dirname, '..')
const SRC = join(ROOT, 'src')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return sourceFiles(p)
    return /\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts') ? [p] : []
  })
}

interface Source {
  file: string
  imports: string[]
  text: string
}

const sources: Source[] = sourceFiles(SRC).map((p) => {
  const text = readFileSync(p, 'utf8')
  const imports = [...text.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm), ...text.matchAll(/^\s*export\s[^'"]*from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1])
  return { file: relative(SRC, p), imports, text }
})

const inLayer = (prefix: string) => sources.filter((s) => s.file.startsWith(prefix))

/** Imports of `files` that match `bad`, as "file → import" lines (empty = rule respected). */
function violations(files: Source[], bad: (imp: string, s: Source) => boolean): string[] {
  return files.flatMap((s) => s.imports.filter((i) => bad(i, s)).map((i) => `${s.file} → ${i}`))
}

const reachesLayer = (s: Source, imp: string, layer: string) =>
  imp.startsWith('.') && relative(SRC, join(SRC, s.file, '..', imp)).startsWith(layer)

describe('architecture rules', () => {
  it('shared is pure: no Electron, Node, React or other layers', () => {
    expect(
      violations(inLayer('shared/'), (i, s) => /^(electron|node:|react)/.test(i) || reachesLayer(s, i, 'main') || reachesLayer(s, i, 'renderer') || reachesLayer(s, i, 'preload'))
    ).toEqual([])
  })

  it('main never imports the interface', () => {
    expect(violations(inLayer('main/'), (i, s) => /^(react|monaco|@monaco)/.test(i) || reachesLayer(s, i, 'renderer') || reachesLayer(s, i, 'preload'))).toEqual([])
  })

  it('renderer never imports Electron, Node or the main process', () => {
    expect(violations(inLayer('renderer/'), (i, s) => /^(electron|node:)/.test(i) || reachesLayer(s, i, 'main') || reachesLayer(s, i, 'preload'))).toEqual([])
  })

  it('preload only bridges the contract', () => {
    expect(violations(inLayer('preload/'), (i) => !(i === 'electron' || i === '@shared/contract'))).toEqual([])
  })

  it('features do not depend on the app shell', () => {
    expect(violations(inLayer('renderer/src/features/'), (i, s) => reachesLayer(s, i, 'renderer/src/app'))).toEqual([])
  })

  it('only services/api.ts touches window.api', () => {
    const users = inLayer('renderer/').filter((s) => /window\.api\b/.test(s.text)).map((s) => s.file)
    expect(users).toEqual(['renderer/src/services/api.ts'])
  })

  it('ipc handlers are the only main module that registers channels', () => {
    const users = inLayer('main/').filter((s) => /ipcMain\.handle/.test(s.text)).map((s) => s.file)
    expect(users).toEqual(['main/ipc/handlers.ts'])
  })
})
