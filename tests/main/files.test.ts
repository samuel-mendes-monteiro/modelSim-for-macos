import { describe, it, expect } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findEntitySource, listProject } from '../../src/main/project/files'

describe('listProject', () => {
  it('finds VHDL files recursively, skipping hidden and build folders', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vhdl files '))
    for (const sub of ['rtl', '.vhdlsim', 'node_modules', 'out']) mkdirSync(join(dir, sub))
    writeFileSync(join(dir, 'rtl', 'alu.vhd'), 'entity alu is port(a : in bit); end;')
    writeFileSync(join(dir, 'alu_tb.vhdl'), 'entity alu_tb is end; architecture t of alu_tb is begin u: entity work.alu port map (a => x); end;')
    writeFileSync(join(dir, 'notes.txt'), 'entity x is end;')
    for (const sub of ['.vhdlsim', 'node_modules', 'out']) writeFileSync(join(dir, sub, 'junk.vhd'), 'entity junk is end;')

    const files = listProject(dir)
    expect(files.map((f) => `${f.rel}:${f.kind}`)).toEqual(['alu_tb.vhdl:testbench', 'rtl/alu.vhd:design'])
    expect(findEntitySource(dir, 'alu')).toContain('entity alu')
    expect(findEntitySource(dir, 'nope')).toBeNull()
  })
})
