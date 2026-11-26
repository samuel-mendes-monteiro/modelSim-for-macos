/** Text of the `help` command. Keep it in sync with commands.ts and the README. */
export const HELP = [
  'Commands (ModelSim-style):',
  '  vcom                 compile all project files',
  '  vsim <top>           select the top-level entity (testbench)',
  '  run [<time> [unit]]  advance the simulation (default: run length in toolbar)',
  '  run -all             run until the testbench stops (60 s safety limit)',
  '  restart              reset simulation time to 0',
  '  break                stop a running simulation',
  '  add wave <pattern>   add signals to the wave (e.g. add wave *, add wave /tb/dut/*)',
  '  delete wave *        remove all signals from the wave',
  '  radix <bin|hex|unsigned|signed>   set the radix of all signals',
  '  force <sig> <v> [<t>][, <v> <t>]... [-repeat <period>]',
  '                       drive a top-level input (times in ns by default, relative to now)',
  '                       e.g. force clock 0 0, 1 50 -repeat 100   force reset 1   force dload 16#9',
  '  force                list active forces',
  '  noforce <sig>|*      remove forces (takes effect on the next run)',
  '  std <08|93c>         VHDL standard',
  '  clear                clear the transcript'
]
