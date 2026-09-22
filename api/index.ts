/**
 * Vercel serverless entry point.
 *
 * Vercel routes every /api/* request here (see vercel.json) and the Express
 * app handles it. The app is imported, not started — `apps/api/src/serve.ts`
 * is what calls listen() for local development.
 */
import app from '../apps/api/src/index.js'

export default app
