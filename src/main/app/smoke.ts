/**
 * Automated end-to-end check (development only). Enabled by environment variables:
 *   VHDLSIM_SMOKE=<png>        screenshot path; the app quits after taking it
 *   VHDLSIM_PROJECT=<dir>      project to open
 *   VHDLSIM_SMOKE_CMDS="a;b"   Transcript commands to type (default: Run -All)
 *   VHDLSIM_SMOKE_JS=<code>    JavaScript evaluated in the page; its result is printed
 *   VHDLSIM_SMOKE_CLICKS="x,y[,shift];…"   clicks in window coordinates
 *   VHDLSIM_SMOKE_WAIT=<ms>    pause before the checks (default 12000)
 */
import { app, type BrowserWindow } from 'electron'
import { writeFileSync } from 'node:fs'
import { sendMenu } from './window'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function attachSmokeTest(win: BrowserWindow) {
  const shot = process.env.VHDLSIM_SMOKE
  if (!shot) return
  const wc = win.webContents
  wc.on('console-message', (_e, _l, msg) => console.log('[renderer]', msg))
  wc.once('did-finish-load', async () => {
    await wait(2500)
    const cmds = process.env.VHDLSIM_SMOKE_CMDS
    if (cmds) {
      for (const c of cmds.split(';')) {
        await wc.executeJavaScript(`(() => {
          const i = document.querySelector('.bottom form input')
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(c.trim())})
          i.dispatchEvent(new Event('input', { bubbles: true }))
          i.form.requestSubmit()
        })()`)
        await wait(c.trim().startsWith('run') ? 4000 : 400)
      }
    } else sendMenu('run-all')
    await wait(Number(process.env.VHDLSIM_SMOKE_WAIT ?? 12000))
    if (process.env.VHDLSIM_SMOKE_JS) {
      console.log('smoke js =>', await wc.executeJavaScript(process.env.VHDLSIM_SMOKE_JS).catch((e) => 'ERR ' + e))
      await wait(500)
    }
    if (process.env.VHDLSIM_SMOKE_CLICKS) {
      for (const c of process.env.VHDLSIM_SMOKE_CLICKS.split(';')) {
        const [x, y, m] = c.split(',')
        const modifiers = (m ? [m] : []) as never
        wc.sendInputEvent({ type: 'mouseDown', x: Number(x), y: Number(y), button: 'left', clickCount: 1, modifiers })
        wc.sendInputEvent({ type: 'mouseUp', x: Number(x), y: Number(y), button: 'left', clickCount: 1, modifiers })
        await wait(300)
      }
      await wait(800)
    }
    writeFileSync(shot, (await wc.capturePage()).toPNG())
    app.quit()
  })
}
