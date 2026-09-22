import { cached } from './requestCache'
import type {
  AskAnswer,
  CrossCallAnalysis,
  Envelope,
  EngineMode,
  ExpertReport,
  InterviewGuide,
  Transcript,
} from '@shared/types'

/**
 * Where the API lives.
 *   - VITE_API_URL wins when set (Render, where API and web are separate services).
 *   - In a production build with nothing set, same-origin: Vercel serves
 *     /api/* from the same host.
 *   - In dev, the local API port.
 */
const BASE = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? '' : 'http://localhost:8787')

export interface CorpusResponse {
  guide: InterviewGuide
  transcripts: Transcript[]
  mode: EngineMode
  model: string | null
}

export type Result<T> = Envelope<T> & { warning?: string }

class ApiError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  }).catch((error: Error) => {
    if (error.name === 'AbortError') throw error
    throw new ApiError('Cannot reach the API.')
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    throw new ApiError(body?.error ?? `Request failed (${response.status})`)
  }
  return (await response.json()) as T
}

/**
 * Cache keys are exported so a view can seed its initial state from the cache
 * synchronously (see `peek`) rather than rendering a spinner for data it
 * already has.
 */
export const cacheKeys = {
  corpus: 'corpus',
  expertAnswers: (transcriptId: string) => `experts:${transcriptId}`,
  analysis: 'analysis',
  ask: (question: string) => `ask:${question.trim().toLowerCase()}`,
}

export const api = {
  corpus: () => cached(cacheKeys.corpus, () => request<CorpusResponse>('/api/corpus')),

  expertAnswers: (transcriptId: string) =>
    cached(cacheKeys.expertAnswers(transcriptId), () =>
      request<Result<ExpertReport>>(`/api/experts/${transcriptId}/answers`),
    ),

  analysis: () => cached(cacheKeys.analysis, () => request<Result<CrossCallAnalysis>>('/api/analysis')),

  /**
   * Questions are cached too — re-asking the same thing is common when
   * comparing answers, and a repeat costs a model call otherwise. `signal`
   * still aborts the in-flight request when the user navigates away.
   */
  ask: (question: string, signal?: AbortSignal) =>
    cached(cacheKeys.ask(question), () =>
      request<Result<AskAnswer>>('/api/ask', { method: 'POST', body: JSON.stringify({ question }), signal }),
    ),
}
