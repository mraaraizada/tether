import type { Segment } from '@shared/types.js'

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'if',
  'of',
  'to',
  'in',
  'on',
  'for',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'it',
  'its',
  'that',
  'this',
  'these',
  'those',
  'as',
  'at',
  'by',
  'with',
  'from',
  'do',
  'does',
  'did',
  'how',
  'what',
  'why',
  'when',
  'would',
  'could',
  'should',
  'you',
  'your',
  'i',
  'we',
  'they',
  'their',
  'there',
  'about',
  'so',
  'not',
  'can',
  'will',
  'more',
  'most',
])

/**
 * Light suffix stripping. Not a real stemmer, but it collapses the pairs that
 * actually matter here — purchase/purchasing, budget/budgets, train/training —
 * which is the difference between matching a guide question and missing it.
 */
function stem(token: string): string {
  for (const suffix of ['ing', 'ies', 'ed', 'es', 'ly', 's']) {
    if (token.length > suffix.length + 3 && token.endsWith(suffix)) {
      const base = token.slice(0, -suffix.length)
      return suffix === 'ies' ? `${base}y` : base
    }
  }
  // purchase -> purchas, so it meets purchasing -> purchas.
  return token.length > 4 && token.endsWith('e') ? token.slice(0, -1) : token
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token))
    .map(stem)
}

const K1 = 1.4
const B = 0.75

/**
 * BM25 over transcript segments. Chosen over embeddings so the app runs with
 * zero external calls for retrieval, stays deterministic (same query → same
 * evidence, which matters for an auditable answer), and has no index to warm.
 * The interface is the swap point for a vector store at 30+ transcripts.
 */
export class SegmentIndex {
  private readonly segments: Segment[]
  private readonly docTokens: string[][]
  private readonly docFreq = new Map<string, number>()
  private readonly avgLength: number

  constructor(segments: Segment[]) {
    // Interviewer prompts are indexed too: they carry the question wording that
    // makes an expert answer findable ("What are the main barriers?").
    this.segments = segments
    this.docTokens = segments.map((segment) => tokenize(segment.text))
    this.avgLength =
      this.docTokens.reduce((sum, tokens) => sum + tokens.length, 0) / Math.max(1, this.docTokens.length)

    for (const tokens of this.docTokens) {
      for (const token of new Set(tokens)) {
        this.docFreq.set(token, (this.docFreq.get(token) ?? 0) + 1)
      }
    }
  }

  score(query: string, docIndex: number): number {
    const tokens = this.docTokens[docIndex]
    if (!tokens.length) return 0
    const counts = new Map<string, number>()
    for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1)

    const total = this.docTokens.length
    let score = 0
    for (const term of new Set(tokenize(query))) {
      const tf = counts.get(term)
      if (!tf) continue
      const df = this.docFreq.get(term) ?? 0
      const idf = Math.log(1 + (total - df + 0.5) / (df + 0.5))
      score += idf * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * tokens.length) / this.avgLength)))
    }
    return score
  }

  /**
   * Returns the top-k segments by score, each expanded with its immediate
   * neighbours so a matched interviewer question drags in the expert's reply.
   *
   * Neighbours are pulled in *before* the cut, and the result is capped at k,
   * so `k` means what it says: an earlier version sliced first and then added
   * neighbours, returning up to 3k segments in document order and silently
   * discarding the ranking.
   */
  search(query: string, k = 12): Segment[] {
    const ranked = this.segments
      .map((_segment, index) => ({ index, score: this.score(query, index) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)

    // Rank-preserving expansion: a neighbour inherits a fraction of its
    // anchor's score so it sorts just below it rather than jumping the queue.
    const best = new Map<number, number>()
    const consider = (index: number, score: number) => {
      if (index < 0 || index >= this.segments.length) return
      if ((best.get(index) ?? 0) >= score) return
      best.set(index, score)
    }

    for (const { index, score } of ranked) {
      consider(index, score)
      const current = this.segments[index]
      if (this.segments[index - 1]?.transcriptId === current.transcriptId) consider(index - 1, score * 0.5)
      if (this.segments[index + 1]?.transcriptId === current.transcriptId) consider(index + 1, score * 0.5)
    }

    return [...best.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, k)
      .map(([index]) => index)
      .sort((a, b) => a - b)
      .map((index) => this.segments[index])
  }
}
