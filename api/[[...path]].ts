/**
 * Vercel serverless entry point.
 *
 * An optional catch-all (`[[...path]]`) rather than `index.ts` plus a rewrite:
 * a rewrite rewrites the path, so Express saw `/api/index` for every request
 * and answered 404 for all of them. A catch-all receives the original URL, so
 * `/api/health` arrives as `/api/health` and the router matches.
 *
 * The app is imported, not started — `apps/api/src/serve.ts` calls listen()
 * for local development.
 */
import app from '../apps/api/src/index.js'

export default app
