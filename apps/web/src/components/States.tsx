import { AlertTriangle, Loader2 } from 'lucide-react'

export function Loading({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2.5 rounded-[18px] border border-dashed border-black/10 bg-white p-6 text-[13px] text-muted"
    >
      <Loader2 size={16} className="animate-spin" />
      {label}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-[18px] border border-[#f0c9a8] bg-[#fdeede] p-5">
      <p className="flex items-center gap-2 text-[13px] font-semibold text-[#9a4b12]">
        <AlertTriangle size={15} />
        {message}
      </p>
      <p className="mt-1 text-[12px] text-[#9a4b12]/80">
        Locally, start it with <code className="font-mono">npm run dev:api</code>. On a deployment, check that{' '}
        <code className="font-mono">VITE_API_URL</code> and the API&apos;s{' '}
        <code className="font-mono">CORS_ORIGIN</code> agree.
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-semibold text-white transition hover:bg-ink/85"
        >
          Retry
        </button>
      )}
    </div>
  )
}

export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-[14px] border border-[#f0c9a8] bg-[#fdeede] px-3.5 py-2.5 text-[12px] text-[#9a4b12]">
      {children}
    </p>
  )
}
