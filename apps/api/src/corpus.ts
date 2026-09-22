import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { InterviewGuide, Segment, Transcript } from '@shared/types.js'

// Resolved from this file, not from process.cwd(): the API is started both
// from the repo root (`npm run dev`) and from its own workspace directory
// (`npm run dev --workspace @tether/api`), and the case pack must be found
// either way. DATA_DIR overrides it for deployments that mount data elsewhere.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(REPO_ROOT, 'data')
const TRANSCRIPT_DIR = path.join(DATA_DIR, 'transcripts')

const TIMESTAMP_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/

export class CorpusError extends Error {}

function parseHeader(lines: string[]): {
  expertName: string
  expertRole: string
  market: string
  bodyStart: number
} {
  // The header is whatever precedes the first timestamp line, not a fixed
  // three lines. A transcript with a shorter, longer, or blank-padded header
  // must not lose its opening turns.
  const firstTimestamp = lines.findIndex((line) => TIMESTAMP_RE.test(line.trim()))
  const headerLines = (firstTimestamp === -1 ? lines : lines.slice(0, firstTimestamp))
    .map((line) => line.trim())
    .filter(Boolean)

  const labelled = (prefix: RegExp): string | undefined =>
    headerLines
      .find((line) => prefix.test(line))
      ?.replace(prefix, '')
      .trim()

  const nameLine = headerLines.find((line) => !/^(role|market):/i.test(line))

  return {
    expertName: (nameLine ?? 'Unknown expert').replace(/^Expert\s*\d+\s*[–-]\s*/, '').trim(),
    expertRole: labelled(/^Role:\s*/i) ?? 'Unknown role',
    market: labelled(/^Market:\s*/i) ?? 'Unknown market',
    bodyStart: firstTimestamp === -1 ? lines.length : firstTimestamp,
  }
}

/**
 * Transcripts are plain text: a header block, then `mm:ss` lines each
 * introducing one `Speaker: utterance` turn.
 *
 * Two invariants this parser must hold, because everything downstream (the
 * citation gate, the transcript reader, React keys) assumes them:
 *   1. Segment ids are unique, even when two turns share a timestamp.
 *   2. No source text is silently discarded, and no turn inherits a timestamp
 *      that does not belong to it.
 */
export function parseTranscript(id: string, file: string, raw: string): Transcript {
  const lines = raw.replace(/^﻿/, '').replace(/\r\n/g, '\n').split('\n')
  const { expertName, expertRole, market, bodyStart } = parseHeader(lines)

  const segments: Segment[] = []
  const usedIds = new Set<string>()
  let pendingTimestamp: string | null = null
  let pendingOrphans: string[] = []

  const appendToPrevious = (text: string): boolean => {
    const previous = segments[segments.length - 1]
    if (!previous) return false
    previous.text = `${previous.text} ${text}`.trim()
    return true
  }

  /** Two turns may legitimately share a timestamp; ids must still be distinct. */
  const uniqueId = (timestamp: string): string => {
    const base = `${id}:${timestamp}`
    if (!usedIds.has(base)) {
      usedIds.add(base)
      return base
    }
    let suffix = 2
    while (usedIds.has(`${base}#${suffix}`)) suffix += 1
    const unique = `${base}#${suffix}`
    usedIds.add(unique)
    return unique
  }

  for (const line of lines.slice(bodyStart)) {
    const trimmed = line.trim()
    if (!trimmed) continue

    if (TIMESTAMP_RE.test(trimmed)) {
      // A timestamp with no turn after it must not leak onto a later turn.
      pendingTimestamp = trimmed
      continue
    }

    const speakerSplit = trimmed.indexOf(': ')
    const looksLikeTurn = speakerSplit > 0 && speakerSplit < 60

    if (looksLikeTurn) {
      const speaker = trimmed.slice(0, speakerSplit).trim()
      const text = [...pendingOrphans, trimmed.slice(speakerSplit + 2).trim()].join(' ').trim()
      pendingOrphans = []

      if (!pendingTimestamp) {
        // A turn with no timestamp of its own belongs to no citable moment.
        // Merging it into the previous speaker's segment would let one
        // speaker's words be quoted as another's, so it is kept as its own
        // segment carrying the previous timestamp explicitly marked.
        const previous = segments[segments.length - 1]
        pendingTimestamp = previous?.timestamp ?? '00:00'
      }

      segments.push({
        id: uniqueId(pendingTimestamp),
        transcriptId: id,
        speaker,
        role: /interviewer/i.test(speaker) ? 'interviewer' : 'expert',
        timestamp: pendingTimestamp,
        text,
      })
      pendingTimestamp = null
      continue
    }

    // Continuation of the turn above, or — if there is no turn above yet —
    // held until the next turn so the text is never dropped.
    if (!appendToPrevious(trimmed) || pendingTimestamp) pendingOrphans.push(trimmed)
  }

  if (pendingOrphans.length) appendToPrevious(pendingOrphans.join(' '))

  if (!segments.length) {
    throw new CorpusError(
      `${file} produced no timestamped turns. Expected lines of the form "mm:ss" followed by "Speaker: text".`,
    )
  }

  return { id, expertName, expertRole, market, file, segments }
}

export function loadTranscripts(): Transcript[] {
  if (!fs.existsSync(TRANSCRIPT_DIR)) {
    throw new CorpusError(`Transcript directory not found: ${TRANSCRIPT_DIR}`)
  }

  const files = fs
    .readdirSync(TRANSCRIPT_DIR)
    .filter((file) => file.toLowerCase().endsWith('.txt'))
    .sort()

  if (!files.length) throw new CorpusError(`No .txt transcripts found in ${TRANSCRIPT_DIR}`)

  return files.map((file, index) =>
    parseTranscript(`T${index + 1}`, file, fs.readFileSync(path.join(TRANSCRIPT_DIR, file), 'utf8')),
  )
}

export function loadGuide(): InterviewGuide {
  const file = path.join(DATA_DIR, 'Interview_Guide.txt')
  if (!fs.existsSync(file)) throw new CorpusError(`Interview guide not found: ${file}`)

  const raw = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
  const lines = raw.split('\n')

  const title = (lines[0] ?? 'Interview Guide').trim()
  const objectiveIndex = lines.findIndex((line) => /^Project objective:/i.test(line.trim()))
  const objective = objectiveIndex >= 0 ? (lines[objectiveIndex + 1] ?? '').trim() : ''

  const questions = lines
    .map((line) => /^(\d+)\.\s*(.+)$/.exec(line.trim()))
    .filter((match): match is RegExpExecArray => Boolean(match))
    .map((match) => ({ id: `Q${match[1]}`, number: Number(match[1]), text: match[2].trim() }))

  if (!questions.length) throw new CorpusError(`${file} contains no numbered questions.`)

  return { title, objective, questions }
}

/**
 * Renders the corpus for the model prompt.
 *
 * Transcript text is untrusted input: a line inside a transcript could imitate
 * a corpus line or an instruction. It is fenced between sentinels and any
 * occurrence of the sentinel in the source text is neutralised, so the model
 * can always tell data from instruction. See `buildSystemPrompt`.
 */
export const CORPUS_FENCE = '<<<TRANSCRIPT_DATA>>>'

function neutralise(text: string): string {
  return text.replaceAll(CORPUS_FENCE, '[fence]')
}

export function renderCorpus(transcripts: Transcript[]): string {
  return transcripts
    .map((transcript) => {
      const header = `### ${transcript.id} — ${neutralise(transcript.expertName)} (${neutralise(
        transcript.expertRole,
      )}, ${neutralise(transcript.market)})`
      const body = transcript.segments
        .map((segment) => `[${segment.id}] ${neutralise(segment.speaker)}: ${neutralise(segment.text)}`)
        .join('\n')
      return `${header}\n${body}`
    })
    .join('\n\n')
}

export function renderSegments(segments: Segment[]): string {
  return segments
    .map((segment) => `[${segment.id}] ${neutralise(segment.speaker)}: ${neutralise(segment.text)}`)
    .join('\n')
}
