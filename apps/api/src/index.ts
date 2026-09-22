import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import express, { type NextFunction, type Request, type Response } from 'express'
import cors from 'cors'
import { CorpusError, loadGuide, loadTranscripts } from './corpus.js'
import { SegmentIndex } from './retrieval.js'
import { LruCache, cacheKey, clearCache, readCache, writeCache } from './cache.js'
import { isModelEnabled, modelId, providerId } from './providers/index.js'
import { GROUNDING_RULES, buildSystemPrompt } from './pipelines/prompts.js'
import {
  answerGuideExtractive,
  answerGuideWithClaude,
  type PipelineOutcome,
} from './pipelines/guideAnswers.js'
import { analyseCrossCallExtractive, analyseCrossCallWithClaude } from './pipelines/themes.js'
import { askExtractive, askWithClaude } from './pipelines/ask.js'
import type { AskAnswer, CrossCallAnalysis, Envelope, ExpertReport, Meta, Segment } from '@shared/types.js'

// The .env lives at the repo root, not in this workspace.
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env') })

const MAX_QUESTION_LENGTH = 400
const ASK_RATE_LIMIT = Number(process.env.ASK_RATE_LIMIT ?? 20) // requests per window
const ASK_RATE_WINDOW_MS = 60_000

// Loading is fail-fast and loud: a missing or malformed case pack must be an
// explicit startup error, not a server that boots and serves an empty corpus.
function loadCorpusOrExit() {
  try {
    const transcripts = loadTranscripts()
    const guide = loadGuide()
    return { transcripts, guide }
  } catch (error) {
    if (error instanceof CorpusError) {
      console.error(`\nCannot start: ${error.message}`)
      console.error(
        'Expected data/transcripts/*.txt and data/Interview_Guide.txt relative to the project root.\n',
      )
    } else {
      console.error('\nCannot start — unexpected error while loading the case pack:\n', error)
    }
    process.exit(1)
  }
}

const { transcripts, guide } = loadCorpusOrExit()
const allSegments: Segment[] = transcripts.flatMap((transcript) => transcript.segments)
const segmentsById = new Map(allSegments.map((segment) => [segment.id, segment]))
const systemPrompt = buildSystemPrompt(guide, transcripts)
const index = new SegmentIndex(allSegments)

/**
 * Fingerprint of everything a cached answer depends on: the transcript text,
 * the interview guide, and the grounding rules. Editing any of them
 * invalidates the cache — an earlier version hashed only the transcripts, so
 * reworded or renumbered guide questions replayed stale answers against
 * questions that no longer existed.
 */
const corpusVersion = cacheKey([
  transcripts.map((t) => [t.id, t.segments.map((s) => [s.id, s.text])]),
  guide.questions.map((q) => [q.id, q.text]),
  guide.objective,
  GROUNDING_RULES,
])

const askCache = new LruCache<Cached<unknown>>(100)

type Cached<T> = { data: T; verified: number; dropped: number }

function meta(partial: Partial<Meta> & { latencyMs: number }): Meta {
  return {
    mode: isModelEnabled() ? 'model' : 'extractive',
    model: modelId(),
    cached: false,
    verifiedCitations: 0,
    droppedCitations: 0,
    ...partial,
  }
}

interface RunOptions<T> {
  key: string[]
  claudeRun: () => Promise<PipelineOutcome<T>>
  extractiveRun: () => PipelineOutcome<T>
  /** Disk for fixed key spaces, memory for open-ended user questions. */
  store: 'disk' | 'memory'
}

async function run<T>(options: RunOptions<T>): Promise<Envelope<T> & { warning?: string }> {
  const started = Date.now()
  const mode = isModelEnabled() ? 'model' : 'extractive'
  const id = cacheKey([...options.key, mode, providerId(), modelId(), corpusVersion])

  const hit = options.store === 'disk' ? readCache<Cached<T>>(id) : (askCache.get(id) as Cached<T> | null)

  if (hit) {
    return {
      data: hit.data,
      meta: meta({
        cached: true,
        verifiedCitations: hit.verified,
        droppedCitations: hit.dropped,
        latencyMs: Date.now() - started,
      }),
    }
  }

  let warning: string | undefined
  let outcome: PipelineOutcome<T>

  if (isModelEnabled()) {
    try {
      outcome = await options.claudeRun()
    } catch (error) {
      // Logged, not swallowed: a silent fallback would hide a broken model
      // path behind plausible-looking extractive output.
      console.error(`[${options.key.join(':')}] model call failed:`, error)
      warning = `Model call failed (${(error as Error).message}); served extractive fallback.`
      outcome = options.extractiveRun()
    }
  } else {
    outcome = options.extractiveRun()
  }

  // Never persist a fallback produced by a failed model call.
  if (!warning) {
    if (options.store === 'disk') writeCache(id, outcome)
    else askCache.set(id, outcome)
  }

  return {
    data: outcome.data,
    warning,
    meta: meta({
      mode: warning ? 'extractive' : mode,
      model: warning ? null : modelId(),
      verifiedCitations: outcome.verified,
      droppedCitations: outcome.dropped,
      latencyMs: Date.now() - started,
    }),
  }
}

const app = express()
app.disable('x-powered-by')

// Locked to the dev origins by default. `*` would let any page a user visits
// spend their API budget through /api/ask.
const allowedOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173,http://localhost:5174')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

app.use(
  cors({
    // Withhold the CORS headers for unknown origins rather than throwing:
    // the browser blocks the response, and the server logs stay clean
    // instead of recording a 500 for every probe.
    origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin)),
  }),
)
app.use(express.json({ limit: '64kb' }))

/** Per-IP fixed window. Crude, but it bounds spend from a runaway client. */
const askHits = new Map<string, { count: number; resetAt: number }>()

function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const key = req.ip ?? 'unknown'
  const now = Date.now()
  const entry = askHits.get(key)

  if (!entry || now > entry.resetAt) {
    askHits.set(key, { count: 1, resetAt: now + ASK_RATE_WINDOW_MS })
    next()
    return
  }

  if (entry.count >= ASK_RATE_LIMIT) {
    res.status(429).json({ error: 'Too many questions — wait a minute and try again.' })
    return
  }

  entry.count += 1
  next()
}

/** Cache clearing is a local maintenance action, not a public endpoint. */
function localOnly(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip ?? ''
  if (ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1') {
    next()
    return
  }
  res.status(403).json({ error: 'Available from localhost only.' })
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    mode: isModelEnabled() ? 'model' : 'extractive',
    model: modelId(),
    transcripts: transcripts.length,
    segments: allSegments.length,
  })
})

app.get('/api/corpus', (_req, res) => {
  res.json({
    guide,
    transcripts,
    mode: isModelEnabled() ? 'model' : 'extractive',
    model: modelId(),
  })
})

app.get('/api/experts/:id/answers', async (req, res) => {
  const transcript = transcripts.find((entry) => entry.id === req.params.id)
  if (!transcript) {
    res.status(404).json({ error: `Unknown expert "${req.params.id}"` })
    return
  }

  res.json(
    await run<ExpertReport>({
      key: ['guide-answers', transcript.id],
      claudeRun: () => answerGuideWithClaude(transcript, guide, systemPrompt, segmentsById),
      extractiveRun: () => answerGuideExtractive(transcript, guide),
      store: 'disk',
    }),
  )
})

app.get('/api/analysis', async (_req, res) => {
  res.json(
    await run<CrossCallAnalysis>({
      key: ['cross-call'],
      claudeRun: () => analyseCrossCallWithClaude(systemPrompt, segmentsById),
      extractiveRun: () => analyseCrossCallExtractive(transcripts, guide),
      store: 'disk',
    }),
  )
})

app.post('/api/ask', rateLimit, async (req, res) => {
  const raw = typeof req.body?.question === 'string' ? req.body.question : ''
  const question = raw.replace(/\s+/g, ' ').trim()

  if (question.length < 3) {
    res.status(400).json({ error: 'Ask a question of at least 3 characters.' })
    return
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    res.status(400).json({ error: `Questions are limited to ${MAX_QUESTION_LENGTH} characters.` })
    return
  }

  const normalised = question.toLowerCase()
  const id = cacheKey([
    'ask',
    normalised,
    isModelEnabled() ? 'model' : 'extractive',
    providerId(),
    modelId(),
    corpusVersion,
  ])
  const hit = askCache.get(id)

  // Retrieval only runs on a miss — it is cheap, but there is no reason to
  // pay for it on a cache hit.
  const retrieved = hit ? [] : index.search(question, 12)

  res.json(
    await run<AskAnswer>({
      key: ['ask', normalised],
      claudeRun: () => askWithClaude(question, systemPrompt, retrieved, segmentsById),
      extractiveRun: () => askExtractive(question, retrieved, segmentsById),
      store: 'memory',
    }),
  )
})

app.post('/api/cache/clear', localOnly, (_req, res) => {
  clearCache()
  askCache.clear()
  res.json({ ok: true })
})

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// Final handler: JSON out, no stack traces over the wire.
app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled API error:', error)
  res.status(500).json({ error: 'Internal server error' })
})

/**
 * The app is exported rather than started here. `serve.ts` starts it locally;
 * a serverless platform imports it and handles the listening itself.
 */
export { app, transcripts, allSegments }
export const startupSummary = () =>
  isModelEnabled() ? `${providerId()} (${modelId()})` : 'extractive (no model provider configured)'

export default app
