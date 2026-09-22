import { callStructured } from '../providers/index.js'
import { COVERAGE_THRESHOLD, findAnswerMatches } from './extractive.js'
import { verifyCitations } from '../verify.js'
import { CITATION_SCHEMA } from './prompts.js'
import type {
  CrossCallAnalysis,
  Disagreement,
  InterviewGuide,
  Segment,
  Theme,
  ThemeEvidence,
  Transcript,
} from '@shared/types.js'
import type { PipelineOutcome } from './guideAnswers.js'

const EVIDENCE_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['transcriptId', 'stance', 'citations'],
    properties: {
      transcriptId: { type: 'string', description: 'e.g. "T2".' },
      stance: { type: 'string', description: "One sentence: this expert's position on the point." },
      citations: CITATION_SCHEMA,
    },
  },
} as const

/**
 * Themes and disagreements are requested in two separate calls rather than
 * one. A single combined response is the largest output in the app and
 * exceeded the inference gateway's timeout (HTTP 504). Two smaller calls run
 * in parallel: each finishes well inside the limit, and a failure in one no
 * longer costs the other. It is also the shape this scales into — per-question
 * map-reduce — rather than one ever-growing prompt.
 */
const THEMES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['themes'],
  properties: {
    themes: {
      type: 'array',
      description: 'Points where two or more experts agree. Strongest first.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'summary', 'agreement'],
        properties: {
          title: { type: 'string', description: 'Short label, max 6 words.' },
          summary: { type: 'string', description: 'One or two sentences on the shared view.' },
          agreement: EVIDENCE_SCHEMA,
        },
      },
    },
  },
} as const

const DISAGREEMENTS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['disagreements'],
  properties: {
    disagreements: {
      type: 'array',
      description: 'Points where experts take materially different positions.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'summary', 'positions'],
        properties: {
          title: { type: 'string', description: 'Short label, max 6 words.' },
          summary: { type: 'string', description: 'One or two sentences naming the split.' },
          positions: EVIDENCE_SCHEMA,
        },
      },
    },
  },
} as const

interface RawThemes {
  themes: { title: string; summary: string; agreement: RawEvidence[] }[]
}

interface RawDisagreements {
  disagreements: { title: string; summary: string; positions: RawEvidence[] }[]
}

interface RawEvidence {
  transcriptId: string
  stance: string
  citations: { segmentId: string; quote: string }[]
}

function slug(value: string, index: number): string {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${base || 'item'}-${index + 1}`
}

export async function analyseCrossCallWithClaude(
  systemPrompt: string,
  segmentsById: Map<string, Segment>,
): Promise<PipelineOutcome<CrossCallAnalysis>> {
  const [themesResult, disagreementsResult] = await Promise.all([
    callStructured<RawThemes>({
      systemStable: systemPrompt,
      userPrompt: `Identify 3 to 5 common themes across all experts: points where at least two experts agree.

For each theme give a short title, a one or two sentence summary, and for every supporting expert their stance plus a verbatim quote.`,
      toolName: 'submit_themes',
      toolDescription: 'Submit the common themes across all expert calls, with verbatim citations.',
      schema: THEMES_SCHEMA,
      maxTokens: 6000,
    }),
    callStructured<RawDisagreements>({
      systemStable: systemPrompt,
      userPrompt: `Identify 2 to 4 genuine disagreements across the experts: points where they differ in substance, such as growth expectations, what decides a purchase, or timelines.

A difference in emphasis counts only if the transcript wording makes it clear. Do not force a disagreement the transcripts do not support — returning fewer is correct.

For each one give a short title, a one or two sentence summary naming the split, and for every expert involved their stance plus a verbatim quote.`,
      toolName: 'submit_disagreements',
      toolDescription: 'Submit genuine disagreements across the expert calls, with verbatim citations.',
      schema: DISAGREEMENTS_SCHEMA,
      maxTokens: 6000,
    }),
  ])

  const output = {
    themes: themesResult.output.themes ?? [],
    disagreements: disagreementsResult.output.disagreements ?? [],
  }

  let verified = 0
  let dropped = 0

  const mapEvidence = (entries: RawEvidence[]): ThemeEvidence[] =>
    entries.map((entry) => {
      // Normalise the model's transcript id ("t1 ", "T1") before scoping.
      // Without this, a format wobble empties the scope map and every
      // citation in the block is blamed on the model as a hallucination.
      const transcriptId = entry.transcriptId.trim().toUpperCase()
      const scoped = new Map([...segmentsById].filter(([id]) => id.startsWith(`${transcriptId}:`)))
      const result = verifyCitations(entry.citations, scoped)
      verified += result.citations.length
      dropped += result.dropped
      return { transcriptId, stance: entry.stance.trim(), citations: result.citations }
    })

  // Nothing is displayed without surviving evidence. A stance whose quotes all
  // failed verification is an unsupported claim, and a theme with no supported
  // stance left is not a finding — both are dropped rather than rendered bare.
  // Observed in practice: a model paraphrased "15 to 20 percent" as "15-20%",
  // which correctly failed the verbatim check.
  const evidenced = (entries: ThemeEvidence[]): ThemeEvidence[] =>
    entries.filter((entry) => entry.citations.length > 0)

  const themes: Theme[] = output.themes
    .map((theme, index) => ({
      id: slug(theme.title, index),
      title: theme.title.trim(),
      summary: theme.summary.trim(),
      agreement: evidenced(mapEvidence(theme.agreement)),
    }))
    .filter((theme) => theme.agreement.length > 0)

  const disagreements: Disagreement[] = output.disagreements
    .map((item, index) => ({
      id: slug(item.title, index),
      title: item.title.trim(),
      summary: item.summary.trim(),
      positions: evidenced(mapEvidence(item.positions)),
    }))
    // A disagreement needs at least two evidenced positions to be a disagreement.
    .filter((item) => item.positions.length > 1)

  return { data: { themes, disagreements }, verified, dropped }
}

/**
 * Extractive fallback: instead of inferring themes (which needs a model), it
 * lays the experts' own answers side by side per guide question. Honest about
 * what it is — the UI labels this mode explicitly.
 */
export function analyseCrossCallExtractive(
  transcripts: Transcript[],
  guide: InterviewGuide,
): PipelineOutcome<CrossCallAnalysis> {
  let verified = 0

  const themes: Theme[] = guide.questions.map((question, index) => {
    const agreement: ThemeEvidence[] = transcripts.flatMap((transcript) => {
      const expertSegments = transcript.segments.filter((segment) => segment.role === 'expert')
      // limit: 2 then take the best confident match — limit: 1 measured
      // 15/18 against the labelled key, limit: 2 measures 17/18.
      const matches = findAnswerMatches(transcript, question.text, {
        limit: 2,
        questionIndex: index,
        questionCount: guide.questions.length,
      })
      const hit = (matches.find((match) => match.lexical >= COVERAGE_THRESHOLD) ?? matches[0])?.segment
      if (!hit) return []
      const result = verifyCitations(
        [{ segmentId: hit.id, quote: hit.text }],
        new Map(expertSegments.map((segment) => [segment.id, segment])),
      )
      verified += result.citations.length
      return [{ transcriptId: transcript.id, stance: hit.text, citations: result.citations }]
    })

    return {
      id: slug(question.text, index),
      title: question.text,
      summary:
        'Side-by-side expert passages retrieved for this guide question (extractive mode — no theme inference).',
      agreement,
    }
  })

  return { data: { themes, disagreements: [] }, verified, dropped: 0 }
}
