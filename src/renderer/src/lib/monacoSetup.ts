import * as monaco from 'monaco-editor'
import { loader } from '@monaco-editor/react'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import { registerVhdl } from './vhdlLanguage'

self.MonacoEnvironment = { getWorker: () => new EditorWorker() }
loader.config({ monaco })
registerVhdl(monaco)
