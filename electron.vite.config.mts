import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const __dirname = dirname(fileURLToPath(import.meta.url))
// `@shared/...` resolves to src/shared in every layer (main, preload, renderer, tests)
const alias = { '@shared': resolve(__dirname, 'src/shared') }

export default defineConfig({
  main: { resolve: { alias }, plugins: [externalizeDepsPlugin()] },
  preload: { resolve: { alias }, plugins: [externalizeDepsPlugin()] },
  renderer: { resolve: { alias }, plugins: [react()] }
})
