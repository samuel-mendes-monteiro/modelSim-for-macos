import type * as Monaco from 'monaco-editor'

const KEYWORDS = `abs access after alias all and architecture array assert assume attribute begin block body buffer bus
case component configuration constant context cover default disconnect downto else elsif end entity exit file for force
function generate generic group guarded if impure in inertial inout is label library linkage literal loop map mod nand new
next nor not null of on open or others out package parameter port postponed procedure process property protected pure
range record register reject release rem report restrict return rol ror select sequence severity shared signal sla sll
sra srl subtype then to transport type unaffected units until use variable vunit wait when while with xnor xor`
  .split(/\s+/)
  .filter(Boolean)

const TYPES = `bit bit_vector boolean character integer natural positive real string time severity_level std_logic
std_logic_vector std_ulogic std_ulogic_vector signed unsigned line text side width file_open_kind file_open_status`
  .split(/\s+/)
  .filter(Boolean)

const BUILTINS = `rising_edge falling_edge to_integer to_unsigned to_signed std_logic_vector resize shift_left shift_right
rotate_left rotate_right to_stdlogicvector to_bitvector conv_integer conv_std_logic_vector readline writeline read write
hread hwrite now finish stop to_string to_hstring`
  .split(/\s+/)
  .filter(Boolean)

export function registerVhdl(monaco: typeof Monaco) {
  monaco.languages.register({ id: 'vhdl', extensions: ['.vhd', '.vhdl'], aliases: ['VHDL', 'vhdl'] })
  monaco.languages.setLanguageConfiguration('vhdl', {
    comments: { lineComment: '--', blockComment: ['/*', '*/'] },
    brackets: [['(', ')']],
    autoClosingPairs: [
      { open: '(', close: ')' },
      { open: '"', close: '"', notIn: ['string'] }
    ],
    surroundingPairs: [
      { open: '(', close: ')' },
      { open: '"', close: '"' }
    ],
    indentationRules: {
      increaseIndentPattern: /^\s*(.*\b(is|begin|then|else|loop|generate|record)\b\s*(--.*)?|.*\($)$/i,
      decreaseIndentPattern: /^\s*(end|else|elsif|begin|when\s+others)\b.*$/i
    }
  })
  monaco.languages.setMonarchTokensProvider('vhdl', {
    ignoreCase: true,
    keywords: KEYWORDS,
    typeKeywords: TYPES,
    builtins: BUILTINS,
    tokenizer: {
      root: [
        [/--.*$/, 'comment'],
        [/\/\*/, 'comment', '@blockComment'],
        [/[xXoObB]"[0-9a-fA-F_xXzZuU\-]*"/, 'number.hex'],
        [/"([^"\\]|\\.)*"/, 'string'],
        [/'[01xXzZuUwWlLhH\-]'/, 'string.bit'],
        [/'[a-zA-Z_]\w*/, 'attribute'],
        [/\d+#[0-9a-fA-F_]+#/, 'number'],
        [/\d[\d_]*(\.\d[\d_]*)?([eE][-+]?\d+)?/, 'number'],
        [/\b(fs|ps|ns|us|ms|sec|min|hr)\b/, 'number.unit'],
        [
          /[a-zA-Z_]\w*/,
          { cases: { '@keywords': 'keyword', '@typeKeywords': 'type', '@builtins': 'predefined', '@default': 'identifier' } }
        ],
        [/<=|=>|:=|\/=|>=|\*\*|[<>=+\-*\/&]/, 'operator'],
        [/[;,.:()]/, 'delimiter']
      ],
      blockComment: [
        [/\*\//, 'comment', '@pop'],
        [/./, 'comment']
      ]
    }
  })
  monaco.editor.defineTheme('vhdlsim-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '569CD6', fontStyle: 'bold' },
      { token: 'type', foreground: '4EC9B0' },
      { token: 'predefined', foreground: 'DCDCAA' },
      { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
      { token: 'string', foreground: 'CE9178' },
      { token: 'string.bit', foreground: 'D7BA7D' },
      { token: 'number', foreground: 'B5CEA8' },
      { token: 'number.hex', foreground: 'D7BA7D' },
      { token: 'number.unit', foreground: 'C586C0' },
      { token: 'attribute', foreground: '9CDCFE' },
      { token: 'operator', foreground: 'D4D4D4' }
    ],
    colors: { 'editor.background': '#1b1c1f' }
  })

  const snippets = [
    ['entity', 'entity ${1:name} is\n\tport (\n\t\t${2:clk} : in std_logic\n\t);\nend entity ${1:name};'],
    ['architecture', 'architecture ${1:rtl} of ${2:name} is\nbegin\n\t$0\nend architecture ${1:rtl};'],
    ['process', '${1:proc}: process (${2:clk})\nbegin\n\tif rising_edge(${2:clk}) then\n\t\t$0\n\tend if;\nend process ${1:proc};'],
    ['ieee', 'library ieee;\nuse ieee.std_logic_1164.all;\nuse ieee.numeric_std.all;\n']
  ]
  monaco.languages.registerCompletionItemProvider('vhdl', {
    provideCompletionItems: (model, pos) => {
      const w = model.getWordUntilPosition(pos)
      const range = { startLineNumber: pos.lineNumber, endLineNumber: pos.lineNumber, startColumn: w.startColumn, endColumn: w.endColumn }
      const K = monaco.languages.CompletionItemKind
      return {
        suggestions: [
          ...snippets.map(([label, body]) => ({
            label,
            kind: K.Snippet,
            insertText: body,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range
          })),
          ...KEYWORDS.map((k) => ({ label: k, kind: K.Keyword, insertText: k, range })),
          ...TYPES.map((k) => ({ label: k, kind: K.TypeParameter, insertText: k, range })),
          ...BUILTINS.map((k) => ({ label: k, kind: K.Function, insertText: k, range }))
        ]
      }
    }
  })
}
