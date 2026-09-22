import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import Card from '../components/Card'
import type { Transcript } from '@shared/types'

export interface FocusRequest {
  segmentId: string
  /** Incremented per click so re-selecting the same citation scrolls again. */
  nonce: number
}

interface TranscriptsViewProps {
  transcripts: Transcript[]
  activeId: string
  onSelectExpert: (id: string) => void
  focus: FocusRequest | null
}

export default function TranscriptsView({
  transcripts,
  activeId,
  onSelectExpert,
  focus,
}: TranscriptsViewProps) {
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  const transcript = transcripts.find((entry) => entry.id === activeId) ?? transcripts[0]

  const segments = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return transcript.segments
    return transcript.segments.filter((segment) => segment.text.toLowerCase().includes(term))
  }, [transcript, query])

  // A citation click must always land. If a search filter is active, the
  // target turn may not be in the DOM at all, so the filter is cleared first —
  // previously the scroll silently did nothing.
  useEffect(() => {
    if (focus) setQuery('')
  }, [focus])

  useEffect(() => {
    if (!focus) return
    const node = containerRef.current?.querySelector(`[data-segment="${CSS.escape(focus.segmentId)}"]`)
    node?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focus, transcript.id, segments])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {transcripts.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => onSelectExpert(entry.id)}
            aria-pressed={entry.id === transcript.id}
            className={`rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition focus-visible:ring-2 focus-visible:ring-lime ${
              entry.id === transcript.id
                ? 'border-ink bg-ink text-white'
                : 'border-black/[0.08] bg-white text-ink hover:bg-black/[0.03]'
            }`}
          >
            {entry.expertName}
          </button>
        ))}

        <label className="relative ml-auto w-full sm:w-[240px]">
          <span className="sr-only">Search this transcript</span>
          <Search
            size={15}
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search this transcript"
            className="h-9 w-full rounded-full border border-black/[0.07] bg-white pl-9 pr-4 text-[12.5px] text-ink outline-none transition placeholder:text-muted focus:border-ink/20 focus:ring-2 focus:ring-lime/60"
          />
        </label>
      </div>

      <Card as="section">
        <header className="mb-4 border-b border-black/[0.06] pb-3">
          <h2 className="text-[16px] font-extrabold tracking-tight text-ink">{transcript.expertName}</h2>
          <p className="text-[12px] text-muted">
            {transcript.expertRole} · {transcript.market} · {transcript.file}
          </p>
        </header>

        <div ref={containerRef} className="space-y-2.5">
          {segments.map((segment) => {
            const isFocused = segment.id === focus?.segmentId
            const isExpert = segment.role === 'expert'
            return (
              <article
                key={segment.id}
                data-segment={segment.id}
                aria-current={isFocused ? 'true' : undefined}
                className={`rounded-[14px] border p-3 transition ${
                  isFocused
                    ? 'border-[#b6d94a] bg-[#f5fbe2] ring-2 ring-lime'
                    : isExpert
                      ? 'border-black/[0.06] bg-[#fbfaf6]'
                      : 'border-transparent bg-transparent'
                }`}
              >
                <p className="flex items-center gap-2 text-[11px] text-muted">
                  <span className="rounded-full bg-ink px-2 py-0.5 font-mono text-[10px] text-white">
                    {segment.timestamp}
                  </span>
                  <span className="font-semibold text-ink/70">{segment.speaker}</span>
                  <span className="font-mono text-[10px] text-muted/70">{segment.id}</span>
                </p>
                <p
                  className={`mt-1.5 text-[13px] leading-relaxed ${isExpert ? 'text-ink/90' : 'text-muted'}`}
                >
                  {segment.text}
                </p>
              </article>
            )
          })}

          {!segments.length && (
            <p className="py-8 text-center text-[13px] text-muted">
              No turn in this transcript matches “{query}”.
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}
