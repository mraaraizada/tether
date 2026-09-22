import { SegmentIndex } from '../retrieval.js'
import type { Segment, Transcript } from '@shared/types.js'

export interface AnswerMatch {
  segment: Segment
  /** Lexical score only — the ordering prior is excluded, so this is a real confidence signal. */
  lexical: number
}

export interface AnswerLookupOptions {
  limit?: number
  /** 0-based position of this question in the guide; feeds the ordering prior. */
  questionIndex?: number
  questionCount?: number
}

/** Per-transcript indexes, built once and reused across all guide questions. */
interface TranscriptIndexes {
  interviewerTurns: Segment[]
  expertTurns: Segment[]
  interviewerIndex: SegmentIndex
  expertIndex: SegmentIndex
  positionById: Map<string, number>
  expertPositionById: Map<string, number>
}

const indexCache = new WeakMap<Transcript, TranscriptIndexes>()

function indexesFor(transcript: Transcript): TranscriptIndexes {
  const cached = indexCache.get(transcript)
  if (cached) return cached

  const interviewerTurns = transcript.segments.filter((segment) => segment.role === 'interviewer')
  const expertTurns = transcript.segments.filter((segment) => segment.role === 'expert')

  const built: TranscriptIndexes = {
    interviewerTurns,
    expertTurns,
    interviewerIndex: new SegmentIndex(interviewerTurns),
    expertIndex: new SegmentIndex(expertTurns),
    positionById: new Map(transcript.segments.map((segment, position) => [segment.id, position])),
    expertPositionById: new Map(expertTurns.map((segment, position) => [segment.id, position])),
  }

  indexCache.set(transcript, built)
  return built
}

/**
 * Locates the expert turns that answer a guide question, without a model.
 *
 * These transcripts are Q&A-shaped, so the strongest signal is not the expert
 * text but the *interviewer's* phrasing: "What are the main barriers?" matches
 * guide question 2 almost word for word, and the answer is the turn after it.
 * We rank interviewer turns (blended with how well their reply matches the
 * question) and fall back to ranking expert turns directly.
 */
export function findAnswerMatches(
  transcript: Transcript,
  questionText: string,
  options: AnswerLookupOptions = {},
): AnswerMatch[] {
  const { limit = 2, questionIndex, questionCount } = options
  const { interviewerTurns, expertTurns, interviewerIndex, expertIndex, positionById, expertPositionById } =
    indexesFor(transcript)

  const scored = interviewerTurns.map((segment, index) => {
    const position = positionById.get(segment.id) ?? -1
    const reply = position >= 0 ? transcript.segments[position + 1] : undefined
    const replyIndex = reply ? (expertPositionById.get(reply.id) ?? -1) : -1
    const replyScore = replyIndex >= 0 ? expertIndex.score(questionText, replyIndex) : 0
    return { reply, index, lexical: interviewerIndex.score(questionText, index) + 0.6 * replyScore }
  })

  const candidates = scored.filter((entry) => entry.lexical > 0 && entry.reply?.role === 'expert')

  if (candidates.length) {
    // Structural prior, not a tie-break: interviewers work down the guide in
    // order, so guide question k lands near the k-th exchange. It is scaled to
    // the observed lexical range (rather than a fixed constant, which behaved
    // differently on every transcript) and it is strong enough to overturn a
    // lexical winner — deliberately, because it has to: "What is holding
    // adoption back?" shares no vocabulary with "main barriers to adoption".
    //
    // Measured on the 18-label key in selftest.ts, top-2 hit rate by weight:
    //   0.0 -> 14/18   0.2 -> 15/18   0.4 -> 16/18   0.9 -> 17/18   2.0 -> 17/18
    // 0.9 sits at the start of the plateau. Caveat worth stating out loud:
    // 18 labels is a small key, so this is tuned, not validated.
    const maxLexical = Math.max(...candidates.map((entry) => entry.lexical))
    const priorWeight = maxLexical * PRIOR_WEIGHT

    const ranked = candidates
      .map((entry) => {
        let prior = 0
        if (
          questionIndex !== undefined &&
          questionCount &&
          questionCount > 1 &&
          interviewerTurns.length > 1
        ) {
          const expected = questionIndex / (questionCount - 1)
          const actual = entry.index / (interviewerTurns.length - 1)
          prior = priorWeight * (1 - Math.abs(expected - actual))
        }
        return {
          match: { segment: entry.reply as Segment, lexical: entry.lexical },
          total: entry.lexical + prior,
        }
      })
      .sort((a, b) => b.total - a.total)

    const seen = new Set<string>()
    const answers: AnswerMatch[] = []
    for (const { match } of ranked) {
      if (seen.has(match.segment.id)) continue
      seen.add(match.segment.id)
      answers.push(match)
      if (answers.length >= limit) break
    }
    return answers
  }

  // Reachable whenever no interviewer turn shares vocabulary with the question:
  // a monologue transcript, or a guide question phrased unlike any prompt.
  return expertTurns
    .map((segment, index) => ({ segment, lexical: expertIndex.score(questionText, index) }))
    .filter((entry) => entry.lexical > 0)
    .sort((a, b) => b.lexical - a.lexical)
    .slice(0, limit)
}

/**
 * Confidence floor for calling a question "answered" in extractive mode.
 * Below it the retrieval is a guess, and the coverage matrix must not claim
 * otherwise. Calibrated against the labelled key in selftest.ts.
 */
export const COVERAGE_THRESHOLD = 0.9
export const PRIOR_WEIGHT = Number(process.env.PRIOR_WEIGHT ?? 0.9)

export function findAnswerSegments(
  transcript: Transcript,
  questionText: string,
  options: AnswerLookupOptions = {},
): Segment[] {
  return findAnswerMatches(transcript, questionText, options).map((match) => match.segment)
}
