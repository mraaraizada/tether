interface LogoProps {
  size?: number
  className?: string
}

/**
 * Tether mark: a lime disc with a dark open ring and a solid centre — the
 * anchor point a claim is tied back to. Kept in sync with
 * `public/favicon.svg`, which is the same geometry at favicon weight.
 */
export default function Logo({ size = 28, className = '' }: LogoProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-lime ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" width={size * 0.62} height={size * 0.62} fill="none">
        <path
          d="M12 3.2a8.8 8.8 0 1 0 8.8 8.8c0-1.1-.2-2.1-.5-3"
          stroke="#1c1c24"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <circle cx="12" cy="12" r="2.9" fill="#1c1c24" />
      </svg>
    </span>
  )
}
