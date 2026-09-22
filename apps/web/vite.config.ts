import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Single source of truth for the types the API and the client share.
      '@shared/types': fileURLToPath(new URL('../../packages/shared/src/types.ts', import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
})
