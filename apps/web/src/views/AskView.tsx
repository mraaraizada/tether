import { useEffect, useRef, useState } from 'react'
import { Search, SendHorizonal } from 'lucide-react'
import Card, { SectionTitle } from '../components/Card'
import Citation from '../components/Citation'
import MetaFooter from '../components/MetaFooter'
import { ErrorState, Loading, Notice } from '../components/States'
import { api, type Result } from '../lib/api'
import type { AskAnswer, Transcript } from '@shared/types'

const SUGGESTIONS = [
  'What do the experts expect for procedure growth over the next 3-5 years?',
  'Where do the experts disagree about what decides a purchase?',
  'How long does a hospital purchase take in each market?',
  'What role does surgeon training play in utilisation?',
]

interface AskViewProps {
  transcripts: Transcript[]
  onOpenSegment: (segmentId: string) => void
}

export default function AskView({ transcripts, onOpenSegment }: AskViewProps) {
  const [question, setQuestion] = useState('')
  const [result, setResult] = useState<Result<AskAnswer> | null>(null)
  const [asked, setAsked] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef<AbortController | null>(null)

  // Abort an outstanding request on unmount and when a new one supersedes it,
  // so a slow answer cannot land after the user has moved on.
  useEffect(() => () => inFlight.current?.abort(), [])

  const labelFor = (transcriptId: string) => {
    const transcript = transcripts.find((entry) => entry.id === transcriptId)
    return transcript ? `${transcript.expertName} · ${transcript.market}` : transcriptId
  }

  const submit = async (value: string) => {
    const trimmed = value.trim()
    if (trimmed.length < 3 || loading) return

    inFlight.current?.abort()
    const controller = new AbortController()
    inFlight.current = controller

    setLoading(true)
    setError(null)
    setAsked(trimmed)
    try {
      const answer = await api.ask(trimmed, controller.signal)
      if (!controller.signal.aborted) setResult(answer)
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setResult(null)
      setError((err as Error).message)
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card as="section">
        <SectionTitle hint="Retrieval picks the relevant turns across all three calls; the answer may only use what it cites.">
          Ask across the transcripts
        </SectionTitle>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submit(question)
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <label className="relative min-w-[220px] flex-1">
            <span className="sr-only">Your question</span>
            <Search
              size={15}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="e.g. Which barrier comes up in every market?"
              className="h-10 w-full rounded-full border border-black/[0.07] bg-[#fbfaf6] pl-9 pr-4 text-[13px] text-ink outline-none transition placeholder:text-muted focus:border-ink/20 focus:ring-2 focus:ring-lime/60"
            />
          </label>
          <button
            type="submit"
            disabled={loading || question.trim().length < 3}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-lime px-4 text-[13px] font-bold text-ink transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <SendHorizonal size={15} />
            Ask
          </button>
        </form>

        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => {
                setQuestion(suggestion)
                void submit(suggestion)
              }}
              className="rounded-full border border-black/[0.08] bg-white px-3 py-1.5 text-left text-[11.5px] text-ink/80 transition hover:bg-black/[0.03]"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </Card>

      {loading && <Loading label="Retrieving evidence and composing a grounded answer..." />}
      {error && <ErrorState message={error} onRetry={() => void submit(asked ?? question)} />}

      {result && !loading && (
        <>
          {result.warning && <Notice>{result.warning}</Notice>}

          <Card as="section">
            <div role="status" aria-live="polite" className="sr-only">
              Answer ready for: {asked}
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{asked}</p>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink/90">{result.data.answer}</p>

            {result.data.insufficientEvidence && result.data.citations.length === 0 && (
              <div className="mt-3">
                <Notice>
                  The transcripts do not contain enough evidence to answer this. Nothing was generated to fill
                  the gap.
                </Notice>
              </div>
            )}

            {result.data.citations.length > 0 && (
              <>
                <h3 className="mt-4 text-[12px] font-bold uppercase tracking-wide text-muted">Evidence</h3>
                <ul className="mt-2 space-y-2">
                  {result.data.citations.map((citation) => (
                    <Citation
                      key={`${citation.segmentId}-${citation.quote.slice(0, 24)}`}
                      citation={citation}
                      expertLabel={labelFor(citation.transcriptId)}
                      onOpen={onOpenSegment}
                    />
                  ))}
                </ul>
              </>
            )}

            <details className="mt-4">
              <summary className="cursor-pointer text-[11.5px] font-semibold text-muted">
                Retrieved context ({result.data.retrieved.length} turns)
              </summary>
              <p className="mt-2 flex flex-wrap gap-1.5">
                {result.data.retrieved.map((segmentId) => (
                  <button
                    key={segmentId}
                    type="button"
                    onClick={() => onOpenSegment(segmentId)}
                    className="rounded-full border border-black/[0.08] px-2 py-0.5 font-mono text-[10.5px] text-ink/70 transition hover:bg-black/[0.04]"
                  >
                    {segmentId}
                  </button>
                ))}
              </p>
            </details>

            <MetaFooter meta={result.meta} />
          </Card>
        </>
      )}
    </div>
  )
}
