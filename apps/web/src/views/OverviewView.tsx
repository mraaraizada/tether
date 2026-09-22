import { CheckCircle2, MinusCircle } from 'lucide-react'
import Card, { SectionTitle } from '../components/Card'
import { Loading, Notice } from '../components/States'
import { api, type CorpusResponse } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import type { ExpertReport } from '@shared/types'

interface OverviewViewProps {
  corpus: CorpusResponse
  onOpenExpert: (transcriptId: string) => void
}

export default function OverviewView({ corpus, onOpenExpert }: OverviewViewProps) {
  const { guide, transcripts } = corpus
  const totalSegments = transcripts.reduce((sum, transcript) => sum + transcript.segments.length, 0)

  // The matrix fetches every expert's report itself rather than waiting for
  // the user to visit each one. Results are cached server-side, so the Guide
  // view reuses them; an earlier version rendered a permanently empty grid.
  const ids = transcripts.map((transcript) => transcript.id).join(',')
  const reportsState = useAsync<ExpertReport[]>(
    async () => {
      const results = await Promise.all(transcripts.map((transcript) => api.expertAnswers(transcript.id)))
      return results.map((result) => result.data)
    },
    [ids],
    // Shares the per-expert entries with the Guide view: whichever screen is
    // opened first pays for the fetch, the other is instant.
    { cacheKey: `coverage:${ids}` },
  )

  const reports = new Map((reportsState.data ?? []).map((report) => [report.transcriptId, report]))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Transcripts" value={String(transcripts.length)} />
        <Stat label="Timestamped turns" value={String(totalSegments)} />
        <Stat label="Guide questions" value={String(guide.questions.length)} />
        <Stat label="Markets" value={transcripts.map((t) => t.market).join(' · ')} small />
      </div>

      <Card as="section">
        <SectionTitle hint={guide.objective}>{guide.title}</SectionTitle>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {transcripts.map((transcript) => (
            <button
              key={transcript.id}
              type="button"
              onClick={() => onOpenExpert(transcript.id)}
              className="rounded-[14px] border border-black/[0.06] bg-[#fbfaf6] p-3.5 text-left transition hover:-translate-y-0.5 hover:shadow-card focus-visible:ring-2 focus-visible:ring-lime"
            >
              <span className="block text-[10.5px] font-semibold uppercase tracking-wide text-muted">
                {transcript.id} · {transcript.market}
              </span>
              <span className="mt-1 block text-[14px] font-bold text-ink">{transcript.expertName}</span>
              <span className="mt-0.5 block text-[12px] text-muted">{transcript.expertRole}</span>
              <span className="mt-2 block text-[11px] text-muted">{transcript.segments.length} turns</span>
            </button>
          ))}
        </div>
      </Card>

      <Card as="section">
        <SectionTitle
          hint={
            corpus.mode === 'model'
              ? "Which guide questions each expert answered, from the model's own coverage flag."
              : 'Extractive mode: a tick means retrieval found a confident match, not that a model judged the answer.'
          }
        >
          Coverage matrix
        </SectionTitle>

        {reportsState.loading && <Loading label="Answering the guide for all experts…" />}
        {reportsState.error && <Notice>Coverage unavailable: {reportsState.error}</Notice>}

        {reportsState.data && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left">
              <caption className="sr-only">
                Interview guide coverage by expert. Each cell states whether that expert addressed that
                question.
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="pb-2 pr-3 text-[11px] font-semibold text-muted">
                    Question
                  </th>
                  {transcripts.map((transcript) => (
                    <th
                      key={transcript.id}
                      scope="col"
                      className="px-2 pb-2 text-center text-[11px] font-semibold text-muted"
                    >
                      {transcript.id}
                      <span className="block font-normal">{transcript.market}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {guide.questions.map((question) => (
                  <tr key={question.id} className="border-t border-black/[0.05]">
                    <th scope="row" className="py-2 pr-3 text-left text-[12px] font-normal text-ink/85">
                      <span className="font-semibold">{question.id}.</span> {question.text}
                    </th>
                    {transcripts.map((transcript) => {
                      const answer = reports
                        .get(transcript.id)
                        ?.answers.find((entry) => entry.questionId === question.id)
                      const answered = answer?.coverage === 'answered'
                      return (
                        <td key={transcript.id} className="px-2 text-center">
                          {/* Icons are decorative; the text is what AT announces. */}
                          {answered ? (
                            <CheckCircle2 size={16} className="mx-auto text-[#4f7a18]" aria-hidden="true" />
                          ) : (
                            <MinusCircle size={16} className="mx-auto text-muted/60" aria-hidden="true" />
                          )}
                          <span className="sr-only">{answered ? 'Answered' : 'Not covered'}</span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

function Stat({ label, value, small = false }: { label: string; value: string; small?: boolean }) {
  return (
    <Card className="!p-4">
      <span className="block text-[11px] text-muted">{label}</span>
      <span
        className={`mt-1 block font-extrabold tracking-tight text-ink ${small ? 'text-[13px]' : 'text-[22px]'}`}
      >
        {value}
      </span>
    </Card>
  )
}
