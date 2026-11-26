/**
 * Preload: exposes the Api contract as `window.api`. Every request method becomes an
 * `ipcRenderer.invoke` on the channel of the same name; events are subscriptions.
 */
import { contextBridge, ipcRenderer } from 'electron'
import { EVENTS, INVOKE_METHODS, type Api, type LogKind, type MenuAction } from '@shared/contract'

function subscribe<A extends unknown[]>(channel: string, cb: (...args: A) => void): () => void {
  const h = (_e: unknown, ...args: unknown[]) => cb(...(args as A))
  ipcRenderer.on(channel, h)
  return () => ipcRenderer.removeListener(channel, h)
}

const invokers = Object.fromEntries(INVOKE_METHODS.map((m) => [m, (...args: unknown[]) => ipcRenderer.invoke(m, ...args)]))

const api = {
  ...invokers,
  onLog: (cb: (kind: LogKind, text: string) => void) => subscribe(EVENTS.log, cb),
  onMenu: (cb: (action: MenuAction) => void) => subscribe(EVENTS.menu, cb)
} as Api

contextBridge.exposeInMainWorld('api', api)
