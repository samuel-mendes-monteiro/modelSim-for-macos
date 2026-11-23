library ieee;
use ieee.std_logic_1164.all;

entity counter_tb is
end entity counter_tb;

architecture sim of counter_tb is
  constant CLK_PERIOD : time := 10 ns;
  signal clk   : std_logic := '0';
  signal rst   : std_logic := '1';
  signal en    : std_logic := '0';
  signal count : std_logic_vector(7 downto 0);
  signal tc    : std_logic;
  signal done  : boolean := false;
begin
  dut : entity work.counter
    generic map (WIDTH => 8)
    port map (clk => clk, rst => rst, en => en, count => count, tc => tc);

  clk <= not clk after CLK_PERIOD / 2 when not done else '0';

  stim : process
  begin
    wait for 25 ns;
    rst <= '0';
    en  <= '1';
    wait for 200 ns;
    en  <= '0';
    wait for 40 ns;
    en  <= '1';
    wait for 2700 ns;
    report "Simulation finished" severity note;
    done <= true;
    wait;
  end process;
end architecture sim;
