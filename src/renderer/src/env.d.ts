/// <reference types="vite/client" />
import type { Api } from '@shared/contract'
declare global {
  interface Window {
    api: Api
  }
}
