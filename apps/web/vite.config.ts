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
  build: {
    // Repo root, not apps/web/dist. Deploy platforms default to looking for
    // `dist` at the root of the repository, and a mismatch there fails the
    // build after it has already succeeded.
    outDir: fileURLToPath(new URL('../../dist', import.meta.url)),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
})
