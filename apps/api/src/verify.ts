import type { Citation, Segment } from '@shared/types.js'

/** Loose normalisation: quotes stay verbatim, but punctuation/spacing drift is forgiven. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^a-z0-9' ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface VerificationResult {
  citations: Citation[]
  dropped: number
}

/**
 * The hallucination gate. A citation survives only if
 *   1. the segment id exists in the corpus, and
 *   2. the quoted text appears verbatim inside that segment.
 *
 * Anything else is dropped before it reaches the UI — the model never gets to
 * decide whether its own evidence is real. There is deliberately no
 * `verified: false` state: an unverified citation is not shown at all, so a
 * flag for it would be a field that can never be false.
 */
export function verifyCitations(
  raw: { segmentId?: string; quote?: string }[] | undefined,
  segmentsById: Map<string, Segment>,
): VerificationResult {
  const citations: Citation[] = []
  let dropped = 0

  for (const entry of raw ?? []) {
    const segmentId = entry.segmentId?.trim()
    const quote = entry.quote?.trim()
    if (!segmentId || !quote) {
      dropped += 1
      continue
    }

    const segment = segmentsById.get(segmentId)
    if (!segment) {
      dropped += 1
      continue
    }

    const verified = normalise(segment.text).includes(normalise(quote))
    if (!verified) {
      dropped += 1
      continue
    }

    citations.push({
      segmentId,
      transcriptId: segment.transcriptId,
      timestamp: segment.timestamp,
      quote,
    })
  }

  // De-duplicate identical (segment, quote) pairs the model may repeat.
  // Duplicates are counted too, so that verified + dropped always equals the
  // number of citations the model submitted — otherwise the telemetry in the
  // UI footer quietly under-reports.
  const seen = new Set<string>()
  const unique = citations.filter((citation) => {
    const key = `${citation.segmentId}|${normalise(citation.quote)}`
    if (seen.has(key)) {
      dropped += 1
      return false
    }
    seen.add(key)
    return true
  })

  return { citations: unique, dropped }
}
