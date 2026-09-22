import type { Meta } from '@shared/types'

/** Run telemetry: mode, cache, and how many citations survived verification. */
export default function MetaFooter({ meta }: { meta: Meta }) {
  const items = [
    `mode: ${meta.mode}`,
    meta.model ? `model: ${meta.model}` : null,
    meta.cached ? 'served from cache' : `${meta.latencyMs} ms`,
    `${meta.verifiedCitations} citations verified`,
    meta.droppedCitations > 0 ? `${meta.droppedCitations} dropped as unverifiable` : null,
  ].filter(Boolean) as string[]

  return (
    <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-muted">
      {items.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </p>
  )
}
