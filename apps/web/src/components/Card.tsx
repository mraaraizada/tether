interface CardProps {
  children: React.ReactNode
  className?: string
  as?: 'div' | 'section' | 'article'
}

export default function Card({ children, className = '', as: Tag = 'div' }: CardProps) {
  return (
    <Tag className={`rounded-[18px] border border-black/[0.06] bg-white p-5 shadow-card ${className}`}>
      {children}
    </Tag>
  )
}

export function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-[17px] font-extrabold tracking-tight text-ink">{children}</h2>
      {hint && <p className="mt-0.5 text-[12px] text-muted">{hint}</p>}
    </div>
  )
}
