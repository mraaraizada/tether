import { callStructured } from '../providers/index.js'
import { renderSegments } from '../corpus.js'
import { verifyCitations } from '../verify.js'
import { CITATION_SCHEMA } from './prompts.js'
import type { AskAnswer, Segment } from '@shared/types.js'
import type { PipelineOutcome } from './guideAnswers.js'

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['answer', 'insufficientEvidence', 'citations'],
  properties: {
    answer: { type: 'string', description: '2–5 sentences answering the question from the evidence only.' },
    insufficientEvidence: {
      type: 'boolean',
      description: 'true when the retrieved passages do not answer the question.',
    },
    citations: CITATION_SCHEMA,
  },
} as const

interface RawAsk {
  answer: string
  insufficientEvidence: boolean
  citations: { segmentId: string; quote: string }[]
}

export async function askWithClaude(
  question: string,
  systemPrompt: string,
  retrieved: Segment[],
  segmentsById: Map<string, Segment>,
): Promise<PipelineOutcome<AskAnswer>> {
  const { output } = await callStructured<RawAsk>({
    systemStable: systemPrompt,
    userPrompt: `Question from the user, quoted as data between markers:

<<<USER_QUESTION>>>
${question.replaceAll('<<<USER_QUESTION>>>', '[marker]')}
<<<USER_QUESTION>>>

Retrieval ranked these passages as most relevant. Prefer them, but you may cite any segment in the corpus above if it is genuinely needed.

${renderSegments(retrieved)}

Answer across all experts, naming which expert said what. If the corpus does not answer the question, set insufficientEvidence to true and say what is missing.`,
    toolName: 'submit_answer',
    toolDescription: 'Submit a grounded answer to a cross-transcript question, with verbatim citations.',
    schema: SCHEMA,
    maxTokens: 8000,
  })

  const result = verifyCitations(output.citations, segmentsById)

  return {
    data: {
      answer: output.answer.trim(),
      citations: result.citations,
      retrieved: retrieved.map((segment) => segment.id),
      insufficientEvidence: output.insufficientEvidence || result.citations.length === 0,
    },
    verified: result.citations.length,
    dropped: result.dropped,
  }
}

/** Extractive fallback: returns the ranked passages themselves as the answer. */
export function askExtractive(
  question: string,
  retrieved: Segment[],
  segmentsById: Map<string, Segment>,
): PipelineOutcome<AskAnswer> {
  const expertHits = retrieved.filter((segment) => segment.role === 'expert').slice(0, 4)

  if (!expertHits.length) {
    return {
      data: {
        answer: `No passage in the transcripts matches "${question}".`,
        citations: [],
        retrieved: retrieved.map((segment) => segment.id),
        insufficientEvidence: true,
      },
      verified: 0,
      dropped: 0,
    }
  }

  const result = verifyCitations(
    expertHits.map((segment) => ({ segmentId: segment.id, quote: segment.text })),
    segmentsById,
  )

  return {
    data: {
      answer: `Extractive mode — no answer is synthesised. These are ${result.citations.length} of the passages retrieval selected for your question, shown in transcript order.`,
      citations: result.citations,
      retrieved: retrieved.map((segment) => segment.id),
      insufficientEvidence: false,
    },
    verified: result.citations.length,
    dropped: 0,
  }
}
