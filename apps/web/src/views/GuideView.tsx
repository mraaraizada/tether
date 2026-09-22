import Card, { SectionTitle } from '../components/Card'
import Citation from '../components/Citation'
import MetaFooter from '../components/MetaFooter'
import { ErrorState, Loading, Notice } from '../components/States'
import { api, cacheKeys, type Result } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import type { ExpertReport, InterviewGuide, Transcript } from '@shared/types'

interface GuideViewProps {
  guide: InterviewGuide
  transcripts: Transcript[]
  activeId: string
  onSelectExpert: (id: string) => void
  onOpenSegment: (segmentId: string) => void
}

export default function GuideView({
  guide,
  transcripts,
  activeId,
  onSelectExpert,
  onOpenSegment,
}: GuideViewProps) {
  const transcript = transcripts.find((entry) => entry.id === activeId) ?? transcripts[0]

  const state = useAsync<Result<ExpertReport>>(() => api.expertAnswers(transcript.id), [transcript.id], {
    cacheKey: cacheKeys.expertAnswers(transcript.id),
  })

  const result = state.data

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
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
            <span className="ml-1.5 font-normal opacity-70">{entry.market}</span>
          </button>
        ))}
      </div>

      {state.loading && <Loading label={`Answering the guide for ${transcript.expertName}...`} />}
      {state.error && <ErrorState message={state.error} onRetry={state.reload} />}

      {result && (
        <>
          {result.warning && <Notice>{result.warning}</Notice>}

          <div className="space-y-3">
            {guide.questions.map((question) => {
              const answer = result.data.answers.find((entry) => entry.questionId === question.id)
              if (!answer) return null
              const notCovered = answer.coverage === 'not_covered'

              return (
                <Card as="section" key={question.id}>
                  <SectionTitle>
                    <span className="text-muted">{question.id}.</span> {question.text}
                  </SectionTitle>

                  <p
                    className={`text-[13px] leading-relaxed ${notCovered ? 'italic text-muted' : 'text-ink/90'}`}
                  >
                    {answer.answer}
                  </p>
                  {notCovered && (
                    <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-[#9a4b12]">
                      Not covered
                    </p>
                  )}

                  {answer.citations.length > 0 && (
                    <ul className="mt-3 space-y-2">
                      {answer.citations.map((citation) => (
                        <Citation
                          key={`${citation.segmentId}-${citation.quote.slice(0, 24)}`}
                          citation={citation}
                          expertLabel={`${transcript.expertName} · ${transcript.market}`}
                          onOpen={onOpenSegment}
                        />
                      ))}
                    </ul>
                  )}
                </Card>
              )
            })}
          </div>

          <MetaFooter meta={result.meta} />
        </>
      )}
    </div>
  )
}
