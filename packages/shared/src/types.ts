/**
 * Domain types shared by the API and the web client.
 *
 * Single source of truth: both sides import this file directly, so a change
 * here is a compile error on whichever side has not kept up. An earlier
 * version kept two copies in sync with a script, which only catches drift if
 * someone remembers to run it.
 */

export interface Segment {
  /** Stable citation key, e.g. "T1:03:10". */
  id: string
  transcriptId: string
  speaker: string
  role: 'interviewer' | 'expert'
  timestamp: string
  text: string
}

export interface Transcript {
  id: string
  expertName: string
  expertRole: string
  market: string
  file: string
  segments: Segment[]
}

export interface GuideQuestion {
  id: string
  number: number
  text: string
}

export interface InterviewGuide {
  title: string
  objective: string
  questions: GuideQuestion[]
}

export interface Citation {
  segmentId: string
  transcriptId: string
  timestamp: string
  quote: string
}

export interface GuideAnswer {
  questionId: string
  answer: string
  citations: Citation[]
  /** 'answered' | 'not_covered' — the model must say when a transcript is silent. */
  coverage: 'answered' | 'not_covered'
}

export interface ExpertReport {
  transcriptId: string
  answers: GuideAnswer[]
}

export interface ThemeEvidence {
  transcriptId: string
  stance: string
  citations: Citation[]
}

export interface Theme {
  id: string
  title: string
  summary: string
  /** Transcript ids that support the theme. */
  agreement: ThemeEvidence[]
}

export interface Disagreement {
  id: string
  title: string
  summary: string
  positions: ThemeEvidence[]
}

export interface CrossCallAnalysis {
  themes: Theme[]
  disagreements: Disagreement[]
}

export interface AskAnswer {
  answer: string
  citations: Citation[]
  /** Segment ids handed to the model, for the "what did it look at" panel. */
  retrieved: string[]
  insufficientEvidence: boolean
}

/** 'model' = a configured LLM answered; 'extractive' = retrieval only. */
export type EngineMode = 'model' | 'extractive'

export interface Meta {
  mode: EngineMode
  model: string | null
  /** Cache + verification telemetry surfaced in the UI footer. */
  cached: boolean
  verifiedCitations: number
  droppedCitations: number
  latencyMs: number
}

export interface Envelope<T> {
  data: T
  meta: Meta
}
