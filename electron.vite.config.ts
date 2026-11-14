import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {},
  preload: {
    build: {
      // O preload em sandbox precisa de CommonJS e de um único bundle.
      rolldownOptions: { output: { format: 'cjs', codeSplitting: false } }
    }
  },
  renderer: {
    plugins: [
      react(),
      {
        name: 'development-csp',
        apply: 'serve',
        // O preâmbulo do React Refresh é inline apenas no desenvolvimento.
        transformIndexHtml: (html) => html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
      }
    ],
    server: { host: '127.0.0.1' }
  }
})
