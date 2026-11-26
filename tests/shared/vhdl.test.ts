import { describe, it, expect } from 'vitest'
import { classifyFiles, defaultTop, entitiesForTop } from '@shared/vhdl/classify'
import { scanUnits } from '@shared/vhdl/scan'

describe('scanUnits', () => {
  it('detects entities, ports and packages, ignoring comments', () => {
    const src = `-- entity fake is port(a: in bit); end;
      library ieee; package my_pkg is end package;
      entity Foo is port ( a : in bit ); end entity;
      entity foo_tb is
      end foo_tb;`
    expect(scanUnits(src)).toEqual({
      entities: [{ name: 'foo', hasPorts: true, inputs: ['a'] }, { name: 'foo_tb', hasPorts: false, inputs: [] }],
      packages: ['my_pkg'],
      instantiates: []
    })
  })

  it('finds input ports (default mode = in, generics ignored) and instantiations', () => {
    const src = `entity top is
        generic ( N : integer := 4 );
        port ( clk, rst : in std_logic; d : std_logic_vector(3 downto 0);
               b : inout bit; q : out std_logic; r : buffer bit );
      end top;
      architecture a of top is begin
        u1: entity work.contador10 port map (clock => clk);
        u2 : component Relogio port map (clock => clk);
        u3: estimulo port map (clock => clk);
      end a;
      entity gen is port ( hora : out bit ); end gen;`
    const u = scanUnits(src)
    expect(u.entities).toEqual([
      { name: 'top', hasPorts: true, inputs: ['clk', 'rst', 'd', 'b'] },
      { name: 'gen', hasPorts: true, inputs: [] }
    ])
    expect(u.instantiates.sort()).toEqual(['contador10', 'estimulo', 'relogio'])
  })
})

describe('classifyFiles', () => {
  const file = (rel: string, text: string | null) => ({ path: `/p/${rel}`, rel, text })
  const files = classifyFiles([
    file('contador10.vhd', 'entity contador10 is port(clock : in std_logic; q : out std_logic); end;'),
    file('estimulo.vhd', 'entity estimulo is port(clock : out std_logic); end;'),
    file('top_modulo.vhd', `entity top_modulo is port(q : out std_logic); end;
      architecture a of top_modulo is begin
        e: entity work.estimulo port map (clock => c);
        u: entity work.contador10 port map (clock => c, q => q);
      end;`),
    file('pkg.vhd', 'package util is end package;'),
    file('alu_tb.vhd', 'entity alu_check is port(a : in bit); end;'),
    file('broken.vhd', null)
  ])
  const kind = (rel: string) => files.find((f) => f.rel === rel)!.kind

  it('marks the entity without inputs that nobody instantiates as the simulation top', () => {
    expect(kind('top_modulo.vhd')).toBe('testbench')
    expect(files.find((f) => f.rel === 'top_modulo.vhd')!.entities[0].top).toBe(true)
    // a stimulus generator instantiated by the top is a design file
    expect(kind('estimulo.vhd')).toBe('design')
    expect(kind('contador10.vhd')).toBe('design')
  })
  it('recognises packages, *_tb names and unreadable files', () => {
    expect(kind('pkg.vhd')).toBe('package')
    expect(kind('alu_tb.vhd')).toBe('testbench')
    expect(kind('broken.vhd')).toBe('design')
  })
  it('picks the default top and orders tops first', () => {
    expect(defaultTop(files)).toBe('top_modulo')
    expect(entitiesForTop(files)[0].name).toBe('top_modulo')
    expect(defaultTop([])).toBe('')
  })
})
