/**
 * Generates docs/arquitetura.pdf from docs/arquitetura.md.
 * Runs inside Electron (npm run docs) so the PDF uses the same Chromium renderer as the app.
 */
import { app, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { marked } from 'marked'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'docs', 'arquitetura.md')
const out = join(root, 'docs', 'arquitetura.pdf')

const css = `
  @page { size: A4; margin: 18mm 16mm 20mm 16mm; }
  body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; font-size: 10.5pt; line-height: 1.5; color: #1d1d1f; }
  h1 { font-size: 22pt; margin: 0 0 4pt; color: #12305e; }
  h1 + p { color: #666; margin-top: 0; }
  h2 { font-size: 15pt; color: #12305e; border-bottom: 1.5px solid #c9d6ea; padding-bottom: 3pt; margin-top: 22pt; break-after: avoid; }
  h3 { font-size: 12pt; color: #24497f; margin-top: 14pt; break-after: avoid; }
  hr { display: none; }
  h2 { break-before: auto; }
  table { border-collapse: collapse; width: 100%; margin: 8pt 0; font-size: 9.5pt; break-inside: avoid; }
  th, td { border: 1px solid #d5dbe5; padding: 4pt 6pt; text-align: left; vertical-align: top; }
  th { background: #eef3fa; }
  code { font-family: Menlo, monospace; font-size: 8.8pt; background: #f2f4f7; padding: 0 3px; border-radius: 3px; }
  pre { background: #f6f8fa; border: 1px solid #e1e4e8; border-radius: 6px; padding: 8pt; font-size: 8.4pt; line-height: 1.35; white-space: pre-wrap; }
  pre code { background: none; padding: 0; }
  figure { margin: 10pt 0; text-align: center; break-inside: avoid; }
  figure svg { max-width: 100%; height: auto; }
  figcaption { font-size: 9pt; color: #555; margin-top: 4pt; }
  ul, ol { padding-left: 18pt; }
  li { margin: 2pt 0; }
`

app.whenReady().then(async () => {
  const body = marked.parse(readFileSync(src, 'utf8'))
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>VHDL Sim — Arquitetura</title><style>${css}</style></head><body>${body}</body></html>`
  const tmp = join(tmpdir(), 'vhdlsim-arquitetura.html')
  writeFileSync(tmp, html)
  const win = new BrowserWindow({ show: false })
  await win.loadURL(pathToFileURL(tmp).href)
  const pdf = await win.webContents.printToPDF({
    pageSize: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate:
      '<div style="font-size:8px;width:100%;padding:0 16mm;color:#888;display:flex;justify-content:space-between"><span>VHDL Sim · Arquitetura e Padrões</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
    margins: { top: 0.6, bottom: 0.7, left: 0.6, right: 0.6 }
  })
  writeFileSync(out, pdf)
  console.log(`PDF written: ${out}`)
  app.quit()
})
