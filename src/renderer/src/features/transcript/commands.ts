/**
 * Parsing of Transcript commands (ModelSim syntax) into a typed Command. Parsing is pure;
 * App executes the result. To add a command: add a variant here, parse it, handle it in App.
 */
import type { Std } from '@shared/project'
import type { Radix } from '@shared/waveform/radix'
import { parseTime } from '@shared/waveform/time'

export type Command =
  | { kind: 'help' }
  | { kind: 'clear' }
  | { kind: 'compile' }
  | { kind: 'vsim'; entity: string }
  | { kind: 'run'; mode: 'step'; lengthFs?: number }
  | { kind: 'run'; mode: 'all' }
  | { kind: 'restart' }
  | { kind: 'break' }
  | { kind: 'add-wave'; pattern: string }
  | { kind: 'delete-wave' }
  | { kind: 'radix'; radix: Radix }
  | { kind: 'list-forces' }
  | { kind: 'force'; args: string }
  | { kind: 'noforce'; names: string[] }
  | { kind: 'std'; std: Std }

export type ParseResult = Command | { error: string }

const RADIX_NAMES: Record<string, Radix> = {
  bin: 'bin',
  binary: 'bin',
  hex: 'hex',
  hexadecimal: 'hex',
  unsigned: 'unsigned',
  dec: 'unsigned',
  decimal: 'signed',
  signed: 'signed'
}

/** Last path component, lower case: /tb/uut/clk → clk */
const leaf = (s: string) => s.split('/').filter(Boolean).pop()!.toLowerCase()

export function parseCommand(raw: string): ParseResult {
  const [cmd, ...args] = raw.trim().split(/\s+/)
  const c = cmd.toLowerCase()
  switch (c) {
    case 'help':
      return { kind: 'help' }
    case 'clear':
      return { kind: 'clear' }
    case 'vcom':
      return { kind: 'compile' }
    case 'vsim': {
      const entity = args.filter((a) => !a.startsWith('-'))[0]?.replace(/^work\./i, '').toLowerCase()
      return entity ? { kind: 'vsim', entity } : { error: 'Usage: vsim <entity>' }
    }
    case 'run': {
      if (args[0] === '-all' || args[0] === '-a' || args[0] === 'all') return { kind: 'run', mode: 'all' }
      if (!args.length) return { kind: 'run', mode: 'step' }
      const t = parseTime(args.join(' '))
      return t === null ? { error: `Invalid time "${args.join(' ')}".` } : { kind: 'run', mode: 'step', lengthFs: t }
    }
    case 'restart':
      return { kind: 'restart' }
    case 'break':
      return { kind: 'break' }
    case 'add':
    case 'delete':
      if (args[0]?.toLowerCase() !== 'wave') return { error: `Usage: ${c} wave <pattern>` }
      return c === 'delete' ? { kind: 'delete-wave' } : { kind: 'add-wave', pattern: args.slice(1).join(' ') || '*' }
    case 'radix': {
      const radix = RADIX_NAMES[(args[args.length - 1] ?? '').toLowerCase()]
      return radix ? { kind: 'radix', radix } : { error: 'Usage: radix <bin|hex|unsigned|signed>' }
    }
    case 'force':
      return args.length ? { kind: 'force', args: args.join(' ') } : { kind: 'list-forces' }
    case 'noforce':
      return args.length ? { kind: 'noforce', names: args.map(leaf) } : { error: 'Usage: noforce <signal> | noforce *' }
    case 'std':
      return args[0] === '08' || args[0] === '93c' ? { kind: 'std', std: args[0] } : { error: 'Usage: std <08|93c>' }
    default:
      return { error: `Unknown command "${cmd}". Type "help".` }
  }
}
