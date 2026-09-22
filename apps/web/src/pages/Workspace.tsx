import { useCallback, useState } from 'react'
import { BookOpenCheck } from 'lucide-react'
import Sidebar from '../components/Sidebar'
import Header from '../components/Header'
import { ErrorState, Loading, Notice } from '../components/States'
import OverviewView from '../views/OverviewView'
import GuideView from '../views/GuideView'
import AnalysisView from '../views/AnalysisView'
import AskView from '../views/AskView'
import TranscriptsView, { type FocusRequest } from '../views/TranscriptsView'
import { api, cacheKeys, type CorpusResponse } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { navItems, type ViewId } from '../lib/nav'

const HEADINGS: Record<ViewId, { title: string; subtitle: string }> = {
  overview: {
    title: 'Expert call workspace',
    subtitle: 'Three calls, one interview guide, every claim traceable.',
  },
  guide: {
    title: 'Interview guide answers',
    subtitle: 'Each guide question answered per expert, with verbatim quotes and timestamps.',
  },
  analysis: {
    title: 'Cross-call analysis',
    subtitle: 'What the experts agree on, and where they genuinely differ.',
  },
  ask: {
    title: 'Ask the corpus',
    subtitle: 'Free-form questions answered only from what the transcripts say.',
  },
  transcripts: { title: 'Source transcripts', subtitle: 'The underlying text, timestamped turn by turn.' },
}

export default function Workspace() {
  const [view, setView] = useState<ViewId>('overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeExpert, setActiveExpert] = useState<string | null>(null)
  const [focus, setFocus] = useState<FocusRequest | null>(null)

  const corpusState = useAsync<CorpusResponse>(() => api.corpus(), [], { cacheKey: cacheKeys.corpus })
  const corpus = corpusState.data
  const transcripts = corpus?.transcripts ?? []

  // The selected expert is derived, never assumed: a transcript id from a
  // previous corpus (or none at all) must not index into an empty array.
  const selectedExpert =
    transcripts.find((entry) => entry.id === activeExpert)?.id ?? transcripts[0]?.id ?? null

  const openSegment = useCallback((segmentId: string) => {
    const [transcriptId] = segmentId.split(':')
    setActiveExpert(transcriptId)
    // A nonce, not just the id, so clicking the same citation twice re-scrolls.
    setFocus((current) => ({ segmentId, nonce: (current?.nonce ?? 0) + 1 }))
    setView('transcripts')
  }, [])

  const openExpert = useCallback((transcriptId: string) => {
    setActiveExpert(transcriptId)
    setView('guide')
  }, [])

  const heading = HEADINGS[view]

  return (
    // Full-bleed app shell: the viewport is the frame. The sidebar is fixed
    // height and the content column is the only thing that scrolls, so the
    // navigation and header never leave the screen on a long transcript.
    <div className="flex h-screen w-full overflow-hidden bg-shell p-2 sm:p-3">
      <Sidebar
        activeId={view}
        onNavigate={(id) => {
          setView(id)
          setSidebarOpen(false)
        }}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        footer={<SidebarFooter hint={navItems.find((item) => item.id === view)?.hint ?? ''} />}
      />

      <div className="min-w-0 flex-1 overflow-y-auto">
        <main className="mx-auto w-full max-w-[1600px] space-y-4 px-3 py-4 sm:px-5 sm:py-5">
          <Header
            title={heading.title}
            subtitle={heading.subtitle}
            mode={corpus?.mode ?? 'extractive'}
            model={corpus?.model ?? null}
            onOpenSidebar={() => setSidebarOpen(true)}
          />

          {corpusState.loading && <Loading label="Loading the case pack…" />}
          {corpusState.error && <ErrorState message={corpusState.error} onRetry={corpusState.reload} />}

          {corpus && !transcripts.length && (
            <Notice>
              The API returned no transcripts. Add .txt files to <code>data/transcripts/</code> and restart
              the API.
            </Notice>
          )}

          {corpus && selectedExpert && (
            <>
              {view === 'overview' && <OverviewView corpus={corpus} onOpenExpert={openExpert} />}

              {view === 'guide' && (
                <GuideView
                  guide={corpus.guide}
                  transcripts={transcripts}
                  activeId={selectedExpert}
                  onSelectExpert={setActiveExpert}
                  onOpenSegment={openSegment}
                />
              )}

              {view === 'analysis' && <AnalysisView transcripts={transcripts} onOpenSegment={openSegment} />}

              {view === 'ask' && <AskView transcripts={transcripts} onOpenSegment={openSegment} />}

              {view === 'transcripts' && (
                <TranscriptsView
                  transcripts={transcripts}
                  activeId={selectedExpert}
                  onSelectExpert={(id) => {
                    setActiveExpert(id)
                    setFocus(null)
                  }}
                  focus={focus}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}

function SidebarFooter({ hint }: { hint: string }) {
  return (
    <div className="mt-6 rounded-[18px] bg-lime p-4">
      <BookOpenCheck size={18} className="text-ink" aria-hidden="true" />
      <p className="mt-2 text-[12px] font-semibold leading-snug text-ink">Grounded answers only</p>
      <p className="mt-1 text-[11px] leading-snug text-ink/70">
        Quotes are verified against the source text before they are shown. {hint}
      </p>
    </div>
  )
}
