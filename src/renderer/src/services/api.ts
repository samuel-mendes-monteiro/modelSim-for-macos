/**
 * The only place the interface touches `window.api` (exposed by the preload). Everything else
 * imports `api` from here, so the bridge can be replaced in tests.
 */
import type { Api } from '@shared/contract'

export const api: Api = window.api

/** Message of an error thrown by a main-process handler, without Electron's wrapping. */
export function errorMessage(e: unknown): string {
  return String(e).replace(/^Error: (Error invoking remote method '\w+': )?(Error: )?/, '')
}
