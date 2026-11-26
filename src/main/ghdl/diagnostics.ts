/** Turning GHDL messages ("file.vhd:12:5:error: …") into structured diagnostics. */
import type { Diagnostic } from '@shared/project'

const DIAG_RE = /^(.+?\.vhdl?):(\d+):(\d+):\s*(error|warning|note)?:?\s*(.*)$/i

export function parseDiagnostics(output: string): Diagnostic[] {
  const out: Diagnostic[] = []
  for (const line of output.split(/\r?\n/)) {
    const m = line.match(DIAG_RE)
    if (!m) continue
    out.push({
      file: m[1],
      line: Number(m[2]),
      col: Number(m[3]),
      severity: (m[4] ?? 'error').toLowerCase() as Diagnostic['severity'],
      message: m[5]
    })
  }
  return out
}
