/** VHDL source templates for new projects and new files. */

/** Turn a folder name into a legal VHDL identifier. */
export function vhdlIdent(name: string): string {
  let id = name.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
  if (!/^[a-z]/.test(id)) id = 'top_' + id
  return id.replace(/_$/, '') || 'top'
}

/** Starter design + testbench for a new project: [fileName, content][] */
export function projectTemplate(projectName: string): [string, string][] {
  const e = vhdlIdent(projectName)
  const design = `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity ${e} is
  port (
    clk : in  std_logic;
    rst : in  std_logic;
    d   : in  std_logic_vector(7 downto 0);
    q   : out std_logic_vector(7 downto 0)
  );
end entity ${e};

architecture rtl of ${e} is
begin
  process (clk)
  begin
    if rising_edge(clk) then
      if rst = '1' then
        q <= (others => '0');
      else
        q <= d;
      end if;
    end if;
  end process;
end architecture rtl;
`
  const tb = `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity ${e}_tb is
end entity ${e}_tb;

architecture sim of ${e}_tb is
  constant CLK_PERIOD : time := 10 ns;
  signal clk  : std_logic := '0';
  signal rst  : std_logic := '1';
  signal d    : std_logic_vector(7 downto 0) := (others => '0');
  signal q    : std_logic_vector(7 downto 0);
  signal done : boolean := false;
begin
  dut : entity work.${e}
    port map (clk => clk, rst => rst, d => d, q => q);

  clk <= not clk after CLK_PERIOD / 2 when not done else '0';

  stim : process
  begin
    wait for 2 * CLK_PERIOD;
    rst <= '0';
    for i in 0 to 15 loop
      d <= std_logic_vector(to_unsigned(i * 17, 8));
      wait for CLK_PERIOD;
    end loop;
    report "Simulation finished" severity note;
    done <= true;
    wait;
  end process;
end architecture sim;
`
  return [
    [`${e}.vhd`, design],
    [`${e}_tb.vhd`, tb]
  ]
}

/** Skeleton of a new file: an empty entity `ent`. */
export function emptyEntity(ent: string): string {
  return `library ieee;\nuse ieee.std_logic_1164.all;\nuse ieee.numeric_std.all;\n\nentity ${ent} is\nend entity ${ent};\n\narchitecture rtl of ${ent} is\nbegin\nend architecture rtl;\n`
}
