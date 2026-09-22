/**
 * Offline checks for the parts that must not silently break: transcript
 * parsing (including malformed input), the citation-verification gate,
 * retrieval ranking, and retrieval accuracy against a hand-labelled key.
 * Run with `npm run verify` — no API key or network needed.
 */
import { CorpusError, loadGuide, loadTranscripts, parseTranscript } from './corpus.js'
import { verifyCitations } from './verify.js'
import { SegmentIndex } from './retrieval.js'
import { COVERAGE_THRESHOLD, findAnswerMatches } from './pipelines/extractive.js'
import { cacheKey } from './cache.js'
import type { Segment } from '@shared/types.js'

let failures = 0

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log(`  pass  ${name}`)
  } else {
    failures += 1
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function section(name: string): void {
  console.log(`\n${name}`)
}

const transcripts = loadTranscripts()
const guide = loadGuide()
const allSegments: Segment[] = transcripts.flatMap((transcript) => transcript.segments)
const segmentsById = new Map(allSegments.map((segment) => [segment.id, segment]))

section('Parsing — shipped case pack')
check('3 transcripts loaded', transcripts.length === 3, `got ${transcripts.length}`)
check('6 guide questions loaded', guide.questions.length === 6, `got ${guide.questions.length}`)
check(
  'every transcript has an expert name',
  transcripts.every((t) => t.expertName.length > 2),
)
check(
  'every segment has a timestamp',
  allSegments.every((s) => /^\d{1,2}:\d{2}/.test(s.timestamp)),
)
check('segment ids are unique', new Set(allSegments.map((s) => s.id)).size === allSegments.length)
check(
  'both roles are present',
  allSegments.some((s) => s.role === 'expert') && allSegments.some((s) => s.role === 'interviewer'),
)

section('Parsing — malformed input')
// Each of these was a silent data-loss bug before: the parser assumed a
// fixed 3-line header, collided ids on repeated timestamps, and dropped
// orphan lines while leaking their timestamp onto the next turn.
const noHeader = parseTranscript('TA', 'a.txt', '00:05\nDr X: hello there world\n')
check(
  'header-less transcript still parses',
  noHeader.segments.length === 1,
  `got ${noHeader.segments.length}`,
)

const shortHeader = parseTranscript('TB', 'b.txt', 'Expert 9 – Dr Y\n01:00\nDr Y: first words here\n')
check('two-line header keeps the first turn', shortHeader.segments.length === 1)
check('missing role degrades gracefully', shortHeader.expertRole === 'Unknown role')

const duplicate = parseTranscript(
  'TC',
  'c.txt',
  'N\nRole: r\nMarket: m\n01:00\nA: first turn\n01:00\nB: second turn\n',
)
check(
  'duplicate timestamps get distinct ids',
  new Set(duplicate.segments.map((s) => s.id)).size === 2,
  duplicate.segments.map((s) => s.id).join(),
)

const orphan = parseTranscript('TD', 'd.txt', 'N\nRole: r\nMarket: m\n01:00\nfloating text\nA: real turn\n')
check(
  'orphan text is not dropped',
  orphan.segments.some((s) => s.text.includes('floating text')),
)

const bom = parseTranscript('TE', 'e.txt', '﻿N\nRole: r\nMarket: m\n01:00\nA: after bom\n')
check('BOM does not shift the header', bom.segments.length === 1)

let threw = false
try {
  parseTranscript('TF', 'f.txt', 'just some prose with no timestamps at all\n')
} catch (error) {
  threw = error instanceof CorpusError
}
check('a transcript with no turns throws CorpusError', threw)

section('Citation verification gate')
const realSegment = segmentsById.get('T1:01:20')
if (!realSegment) throw new Error('Fixture segment T1:01:20 missing — update the test.')
const realQuote = 'capital budget approval'

check(
  'accepts a verbatim quote',
  verifyCitations([{ segmentId: realSegment.id, quote: realQuote }], segmentsById).citations.length === 1,
)
check(
  'rejects an invented quote in a real segment',
  verifyCitations(
    [{ segmentId: realSegment.id, quote: 'hospitals expect a 40 percent cost reduction' }],
    segmentsById,
  ).dropped === 1,
)
check(
  'rejects a quote attributed to the wrong expert',
  verifyCitations([{ segmentId: 'T3:01:05', quote: realQuote }], segmentsById).dropped === 1,
)
check(
  'rejects a fabricated segment id',
  verifyCitations([{ segmentId: 'T9:99:99', quote: realQuote }], segmentsById).dropped === 1,
)
check(
  'tolerates punctuation and case drift',
  verifyCitations([{ segmentId: realSegment.id, quote: 'Capital Budget Approval.' }], segmentsById).citations
    .length === 1,
)

const deduped = verifyCitations(
  [
    { segmentId: realSegment.id, quote: realQuote },
    { segmentId: realSegment.id, quote: realQuote },
  ],
  segmentsById,
)
check('de-duplicates repeated citations', deduped.citations.length === 1)
check(
  'counts a duplicate as dropped so the tally balances',
  deduped.citations.length + deduped.dropped === 2,
  `${deduped.citations.length}+${deduped.dropped}`,
)

section('Retrieval ranking')
const index = new SegmentIndex(allSegments)
const k = 12
const results = index.search('what are the main barriers to adoption', k)
// Neighbour expansion used to run after the slice, returning up to 3k
// segments in document order and discarding the ranking entirely.
check(`search(k=${k}) returns at most k segments`, results.length <= k, `got ${results.length}`)
check('search returns something relevant', results.length > 0)
check('search on gibberish returns nothing', index.search('zzzz qqqq xxxx', k).length === 0)

section('Cache key')
const base = cacheKey(['guide-answers', 'T1', 'model', 'm', 'v1'])
check('same inputs produce the same key', base === cacheKey(['guide-answers', 'T1', 'model', 'm', 'v1']))
check(
  'a different corpus version produces a different key',
  base !== cacheKey(['guide-answers', 'T1', 'model', 'm', 'v2']),
)

section('Retrieval accuracy (extractive fallback, hand-labelled key)')
// The timestamp of the turn that actually answers each guide question.
const KEY: Record<string, string[]> = {
  T1: ['00:18', '01:20', '02:18', '03:10', '05:07', '06:08'],
  T2: ['00:16', '01:10', '02:08', '03:05', '05:08', '06:05'],
  T3: ['00:14', '01:05', '02:07', '03:10', '04:06', '05:04'],
}

// Both limits are measured: production calls use limit 2 for guide answers
// and limit 2 for cross-call. A regression at limit 1 was invisible when
// only limit 2 was tested.
for (const limit of [1, 2] as const) {
  let hits = 0
  let total = 0
  for (const transcript of transcripts) {
    guide.questions.forEach((question, questionIndex) => {
      const found = findAnswerMatches(transcript, question.text, {
        limit,
        questionIndex,
        questionCount: guide.questions.length,
      })
      total += 1
      if (found.some((match) => match.segment.timestamp === KEY[transcript.id][questionIndex])) hits += 1
    })
  }
  const rate = hits / total
  console.log(`  top-${limit} hit rate: ${hits}/${total} (${Math.round(rate * 100)}%)`)
  check(`top-${limit} hit rate meets its floor`, rate >= (limit === 1 ? 0.8 : 0.9))
}

const confident = transcripts.flatMap((transcript) =>
  guide.questions.map((question, questionIndex) =>
    findAnswerMatches(transcript, question.text, {
      limit: 1,
      questionIndex,
      questionCount: guide.questions.length,
    }),
  ),
)
check(
  'coverage threshold separates confident from weak matches',
  confident.some((matches) => (matches[0]?.lexical ?? 0) >= COVERAGE_THRESHOLD),
)

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`)
process.exit(failures === 0 ? 0 : 1)
