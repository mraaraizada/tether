import Card, { SectionTitle } from '../components/Card'
import Citation from '../components/Citation'
import MetaFooter from '../components/MetaFooter'
import { ErrorState, Loading, Notice } from '../components/States'
import { api, cacheKeys, type Result } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import type { CrossCallAnalysis, ThemeEvidence, Transcript } from '@shared/types'

interface AnalysisViewProps {
  transcripts: Transcript[]
  onOpenSegment: (segmentId: string) => void
}

export default function AnalysisView({ transcripts, onOpenSegment }: AnalysisViewProps) {
  const state = useAsync<Result<CrossCallAnalysis>>(() => api.analysis(), [], {
    cacheKey: cacheKeys.analysis,
  })
  const result = state.data

  const labelFor = (transcriptId: string) => {
    const transcript = transcripts.find((entry) => entry.id === transcriptId)
    return transcript ? `${transcript.expertName} · ${transcript.market}` : transcriptId
  }

  return (
    <div className="space-y-4">
      {state.loading && <Loading label="Comparing all three calls..." />}
      {state.error && <ErrorState message={state.error} onRetry={state.reload} />}

      {result && (
        <>
          {result.warning && <Notice>{result.warning}</Notice>}

          <section>
            <SectionTitle hint="Points where at least two experts align, each in their own words.">
              Common themes
            </SectionTitle>
            <div className="space-y-3">
              {result.data.themes.map((theme) => (
                <Card as="article" key={theme.id}>
                  <h3 className="text-[15px] font-bold text-ink">{theme.title}</h3>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-ink/80">{theme.summary}</p>
                  <EvidenceGrid
                    evidence={theme.agreement}
                    labelFor={labelFor}
                    onOpenSegment={onOpenSegment}
                  />
                </Card>
              ))}
            </div>
          </section>

          <section>
            <SectionTitle hint="Where the experts genuinely differ, not just differences in emphasis.">
              Disagreements
            </SectionTitle>
            {result.data.disagreements.length ? (
              <div className="space-y-3">
                {result.data.disagreements.map((item) => (
                  <Card as="article" key={item.id} className="border-l-4 !border-l-[#e0a86a]">
                    <h3 className="text-[15px] font-bold text-ink">{item.title}</h3>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-ink/80">{item.summary}</p>
                    <EvidenceGrid
                      evidence={item.positions}
                      labelFor={labelFor}
                      onOpenSegment={onOpenSegment}
                    />
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <p className="text-[12.5px] text-muted">
                  No disagreements reported. Extractive mode leaves this empty by design: inferring a
                  disagreement needs a model, and guessing one is exactly the failure this app is built to
                  avoid.
                </p>
              </Card>
            )}
          </section>

          <MetaFooter meta={result.meta} />
        </>
      )}
    </div>
  )
}

interface EvidenceGridProps {
  evidence: ThemeEvidence[]
  labelFor: (transcriptId: string) => string
  onOpenSegment: (segmentId: string) => void
}

function EvidenceGrid({ evidence, labelFor, onOpenSegment }: EvidenceGridProps) {
  return (
    <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
      {evidence.map((entry) => (
        <div key={`${entry.transcriptId}-${entry.stance.slice(0, 20)}`} className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            {labelFor(entry.transcriptId)}
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink/85">{entry.stance}</p>
          <ul className="mt-2 space-y-2">
            {entry.citations.map((citation) => (
              <Citation
                key={`${citation.segmentId}-${citation.quote.slice(0, 24)}`}
                citation={citation}
                expertLabel={labelFor(entry.transcriptId)}
                onOpen={onOpenSegment}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
