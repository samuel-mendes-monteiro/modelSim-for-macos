import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { vhdlIdent, projectTemplate } from '../src/main/templates'
import { findGhdl, compileFiles, simulate } from '../src/main/ghdl'

describe('vhdlIdent', () => {
  it('sanitizes folder names', () => {
    expect(vhdlIdent('My Project')).toBe('my_project')
    expect(vhdlIdent('123-alu')).toBe('top_123_alu')
    expect(vhdlIdent('ULA (v2)')).toBe('ula_v2')
    expect(vhdlIdent('___')).toBe('top')
  })
})

describe.skipIf(!findGhdl())('project template', () => {
  it('compiles and simulates out of the box', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'new proj '))
    const files = projectTemplate('Meu Projeto 1').map(([n, c]) => {
      writeFileSync(join(dir, n), c)
      return join(dir, n)
    })
    const log = () => {}
    expect((await compileFiles(dir, files, '08', log)).ok).toBe(true)
    expect((await simulate(dir, 'meu_projeto_1_tb', 'all', '08', log)).ok).toBe(true)
  })
})
