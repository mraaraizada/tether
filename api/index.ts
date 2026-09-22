import type { IncomingMessage, ServerResponse } from 'node:http'
import app from '../apps/api/src/index.js'

/**
 * Vercel serverless entry point.
 *
 * Vercel does not hand the function the request path: a rewrite replaces it,
 * and a catch-all arrives as "/". Either way Express saw the wrong URL and
 * answered 404 for everything. So the real path is passed explicitly as a
 * query parameter by the rewrite in vercel.json, and rebuilt here before the
 * Express router runs.
 *
 * The app is imported, not started — `apps/api/src/serve.ts` calls listen()
 * for local development.
 */
export default function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const path = url.searchParams.get('__path')

  if (path !== null) {
    url.searchParams.delete('__path')
    const query = url.searchParams.toString()
    req.url = `/api/${path}${query ? `?${query}` : ''}`
  }

  return (app as unknown as (req: IncomingMessage, res: ServerResponse) => void)(req, res)
}
