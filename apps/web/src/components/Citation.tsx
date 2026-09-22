import { Clock3 } from 'lucide-react'
import type { Citation as CitationType } from '@shared/types'

interface CitationProps {
  citation: CitationType
  expertLabel: string
  onOpen: (segmentId: string) => void
}

/**
 * The evidence primitive. Quote + expert + timestamp, clickable through to the
 * exact turn in the transcript reader. Nothing in this app states a finding
 * without one of these next to it.
 */
export default function Citation({ citation, expertLabel, onOpen }: CitationProps) {
  return (
    <li className="rounded-[14px] border border-black/[0.06] bg-[#fbfaf6] p-3">
      <blockquote className="text-[12.5px] leading-relaxed text-ink/85">“{citation.quote}”</blockquote>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold text-ink/70">{expertLabel}</span>
        <button
          type="button"
          onClick={() => onOpen(citation.segmentId)}
          className="inline-flex items-center gap-1 rounded-full bg-ink px-2 py-0.5 text-[10.5px] font-semibold text-white transition hover:bg-ink/85"
          aria-label={`Open ${citation.segmentId} in the transcript`}
        >
          <Clock3 size={10} />
          {citation.timestamp}
        </button>
        <span className="text-[10.5px] text-muted">{citation.segmentId}</span>
        <span
          className="rounded-full bg-[#eef7d6] px-2 py-0.5 text-[10px] font-semibold text-[#4f7a18]"
          title="This quote was matched verbatim against the source transcript before being displayed."
        >
          verified
        </span>
      </div>
    </li>
  )
}
