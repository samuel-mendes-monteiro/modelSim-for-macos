import Editor, { OnMount } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import { useEffect, useRef } from 'react'
import type { Diagnostic } from '@shared/project'

interface Props {
  path: string
  value: string
  diagnostics: Diagnostic[]
  reveal: { line: number; col: number; nonce: number } | null
  onChange: (v: string) => void
}

export default function EditorPane({ path, value, diagnostics, reveal, onChange }: Props) {
  const ed = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)

  const applyMarkers = () => {
    const model = ed.current?.getModel()
    if (!model) return
    monaco.editor.setModelMarkers(
      model,
      'ghdl',
      diagnostics
        .filter((d) => d.file === path)
        .map((d) => ({
          startLineNumber: d.line,
          startColumn: d.col,
          endLineNumber: d.line,
          endColumn: Math.max(d.col + 1, model.getLineMaxColumn(Math.min(d.line, model.getLineCount()))),
          message: d.message,
          severity: d.severity === 'error' ? monaco.MarkerSeverity.Error : d.severity === 'warning' ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Info,
          source: 'ghdl'
        }))
    )
  }

  useEffect(applyMarkers, [diagnostics, path])

  useEffect(() => {
    if (!reveal || !ed.current) return
    ed.current.revealLineInCenter(reveal.line)
    ed.current.setPosition({ lineNumber: reveal.line, column: reveal.col })
    ed.current.focus()
  }, [reveal, path])

  const onMount: OnMount = (editor) => {
    ed.current = editor
    applyMarkers()
    if (reveal) {
      editor.revealLineInCenter(reveal.line)
      editor.setPosition({ lineNumber: reveal.line, column: reveal.col })
    }
    editor.focus()
  }

  return (
    <Editor
      path={path}
      defaultLanguage="vhdl"
      language="vhdl"
      theme="vhdlsim-dark"
      value={value}
      onChange={(v) => onChange(v ?? '')}
      onMount={onMount}
      options={{
        fontFamily: 'SF Mono, Menlo, monospace',
        fontSize: 13,
        minimap: { enabled: false },
        tabSize: 2,
        insertSpaces: true,
        renderWhitespace: 'selection',
        scrollBeyondLastLine: false,
        automaticLayout: true,
        glyphMargin: true
      }}
    />
  )
}
