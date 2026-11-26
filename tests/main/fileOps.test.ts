import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { renameFile, duplicateFile, copyIntoProject } from '../../src/main/project/fileOps'

const fresh = () => {
  const d = mkdtempSync(join(tmpdir(), 'fileops '))
  writeFileSync(join(d, 'alu.vhd'), 'x')
  writeFileSync(join(d, 'mux.vhd'), 'y')
  return d
}

describe('renameFile', () => {
  it('keeps the extension when omitted', () => {
    const d = fresh()
    expect(renameFile(join(d, 'alu.vhd'), 'ula')).toBe(join(d, 'ula.vhd'))
    expect(existsSync(join(d, 'ula.vhd'))).toBe(true)
    expect(existsSync(join(d, 'alu.vhd'))).toBe(false)
  })
  it('accepts a new extension', () => expect(renameFile(join(fresh(), 'alu.vhd'), 'alu.vhdl')).toMatch(/alu\.vhdl$/))
  it('refuses to overwrite another file', () => {
    const d = fresh()
    expect(() => renameFile(join(d, 'alu.vhd'), 'mux.vhd')).toThrow(/already exists/)
    expect(readFileSync(join(d, 'mux.vhd'), 'utf8')).toBe('y')
  })
  it('allows a case-only rename', () => {
    const d = fresh()
    expect(renameFile(join(d, 'alu.vhd'), 'ALU.vhd')).toBe(join(d, 'ALU.vhd'))
  })
  it('rejects names with slashes', () => expect(() => renameFile(join(fresh(), 'alu.vhd'), '../x.vhd')).toThrow(/Invalid/))
})

describe('duplicateFile', () => {
  it('creates numbered copies', () => {
    const d = fresh()
    expect(duplicateFile(join(d, 'alu.vhd'))).toBe(join(d, 'alu_copy.vhd'))
    expect(duplicateFile(join(d, 'alu.vhd'))).toBe(join(d, 'alu_copy2.vhd'))
    expect(readFileSync(join(d, 'alu_copy2.vhd'), 'utf8')).toBe('x')
  })
})

describe('copyIntoProject', () => {
  const setup = () => {
    const proj = fresh()
    const ext = mkdtempSync(join(tmpdir(), 'outside '))
    writeFileSync(join(ext, 'reg.vhd'), 'reg')
    writeFileSync(join(ext, 'alu.vhd'), 'other alu')
    return { proj, ext }
  }
  const never = () => {
    throw new Error('should not ask')
  }
  it('copies an outside file into the project', () => {
    const { proj, ext } = setup()
    expect(copyIntoProject(join(ext, 'reg.vhd'), proj, never)).toBe(join(proj, 'reg.vhd'))
    expect(readFileSync(join(proj, 'reg.vhd'), 'utf8')).toBe('reg')
    expect(existsSync(join(ext, 'reg.vhd'))).toBe(true)
  })
  it('returns files already inside the project unchanged', () => {
    const { proj } = setup()
    expect(copyIntoProject(join(proj, 'alu.vhd'), proj, never)).toBe(join(proj, 'alu.vhd'))
  })
  it('does not ask when the same content already exists', () => {
    const { proj, ext } = setup()
    writeFileSync(join(proj, 'reg.vhd'), 'reg')
    expect(copyIntoProject(join(ext, 'reg.vhd'), proj, never)).toBe(join(proj, 'reg.vhd'))
  })
  it('handles name conflicts: replace, keep both, skip', () => {
    const { proj, ext } = setup()
    expect(copyIntoProject(join(ext, 'alu.vhd'), proj, () => 'skip')).toBeNull()
    expect(readFileSync(join(proj, 'alu.vhd'), 'utf8')).toBe('x')
    expect(copyIntoProject(join(ext, 'alu.vhd'), proj, () => 'keep-both')).toBe(join(proj, 'alu_2.vhd'))
    expect(readFileSync(join(proj, 'alu.vhd'), 'utf8')).toBe('x')
    expect(copyIntoProject(join(ext, 'alu.vhd'), proj, () => 'replace')).toBe(join(proj, 'alu.vhd'))
    expect(readFileSync(join(proj, 'alu.vhd'), 'utf8')).toBe('other alu')
  })
})
