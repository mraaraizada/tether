import { callStructured } from '../providers/index.js'
import { COVERAGE_THRESHOLD, findAnswerMatches } from './extractive.js'
import { verifyCitations } from '../verify.js'
import { CITATION_SCHEMA } from './prompts.js'
import type { ExpertReport, GuideAnswer, InterviewGuide, Segment, Transcript } from '@shared/types.js'

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['answers'],
  properties: {
    answers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['questionId', 'coverage', 'answer', 'citations'],
        properties: {
          questionId: { type: 'string', description: 'Guide question id, e.g. "Q3".' },
          coverage: {
            type: 'string',
            enum: ['answered', 'not_covered'],
            description: 'Use "not_covered" when this expert never addressed the question.',
          },
          answer: {
            type: 'string',
            description: '1–3 sentences summarising only what this expert said.',
          },
          citations: CITATION_SCHEMA,
        },
      },
    },
  },
} as const

interface RawAnswers {
  answers: {
    questionId: string
    coverage: 'answered' | 'not_covered'
    answer: string
    citations: { segmentId: string; quote: string }[]
  }[]
}

export interface PipelineOutcome<T> {
  data: T
  verified: number
  dropped: number
}

export async function answerGuideWithClaude(
  transcript: Transcript,
  guide: InterviewGuide,
  systemPrompt: string,
  segmentsById: Map<string, Segment>,
): Promise<PipelineOutcome<ExpertReport>> {
  const { output } = await callStructured<RawAnswers>({
    systemStable: systemPrompt,
    userPrompt: `Answer every interview-guide question for expert ${transcript.id} (${transcript.expertName}, ${transcript.market}) using ONLY segments whose id starts with "${transcript.id}:".

Return one entry per guide question, in guide order (${guide.questions.map((q) => q.id).join(', ')}).
Give 1–3 supporting verbatim quotes per answered question.`,
    toolName: 'submit_guide_answers',
    toolDescription: 'Submit the interview-guide answers for one expert, with verbatim citations.',
    schema: SCHEMA,
  })

  let verified = 0
  let dropped = 0

  // Only this expert's segments are citable — a cross-expert citation is a bug.
  const ownSegments = new Map([...segmentsById].filter(([id]) => id.startsWith(`${transcript.id}:`)))

  const byId = new Map(output.answers.map((entry) => [entry.questionId, entry]))
  const answers: GuideAnswer[] = guide.questions.map((question) => {
    const raw = byId.get(question.id)
    if (!raw) {
      return {
        questionId: question.id,
        coverage: 'not_covered',
        answer: 'No model output for this question.',
        citations: [],
      }
    }
    const result = verifyCitations(raw.citations, ownSegments)
    verified += result.citations.length
    dropped += result.dropped
    return {
      questionId: question.id,
      coverage: raw.coverage,
      answer: raw.answer.trim() || 'Not covered by this expert.',
      citations: result.citations,
    }
  })

  return { data: { transcriptId: transcript.id, answers }, verified, dropped }
}

/**
 * Deterministic fallback used when no API key is configured. It is genuinely
 * extractive: the "answer" is the expert's own sentence, retrieved by BM25 on
 * the guide question, so it is always traceable and never invented.
 *
 * Coverage is a real signal here, not a constant: retrieval always returns
 * *something*, so a weak lexical match is reported as `not_covered` rather
 * than filling the coverage matrix with green ticks it has not earned.
 */
export function answerGuideExtractive(
  transcript: Transcript,
  guide: InterviewGuide,
): PipelineOutcome<ExpertReport> {
  const expertSegments = transcript.segments.filter((segment) => segment.role === 'expert')
  const segmentsById = new Map(expertSegments.map((segment) => [segment.id, segment]))

  let verified = 0

  const answers: GuideAnswer[] = guide.questions.map((question, questionIndex) => {
    const matches = findAnswerMatches(transcript, question.text, {
      limit: 2,
      questionIndex,
      questionCount: guide.questions.length,
    })
    const confident = matches.filter((match) => match.lexical >= COVERAGE_THRESHOLD)
    const hits = (confident.length ? confident : matches).map((match) => match.segment)

    if (!hits.length || !confident.length) {
      // Still show the best guess as evidence, but do not claim it answers
      // the question — the UI renders `not_covered` distinctly.
      const weak = verifyCitations(
        hits.map((segment) => ({ segmentId: segment.id, quote: segment.text })),
        segmentsById,
      )
      verified += weak.citations.length
      return {
        questionId: question.id,
        coverage: 'not_covered',
        answer: hits.length
          ? 'No passage in this transcript clearly answers this question. The closest match is shown below.'
          : 'No matching passage found in this transcript.',
        citations: weak.citations,
      }
    }
    const result = verifyCitations(
      hits.map((segment) => ({ segmentId: segment.id, quote: segment.text })),
      segmentsById,
    )
    verified += result.citations.length
    return {
      questionId: question.id,
      coverage: 'answered',
      answer: hits[0].text,
      citations: result.citations,
    }
  })

  return { data: { transcriptId: transcript.id, answers }, verified, dropped: 0 }
}
