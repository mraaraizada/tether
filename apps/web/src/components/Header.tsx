import { Menu } from 'lucide-react'
import EngineBadge from './EngineBadge'
import type { EngineMode } from '@shared/types'

interface HeaderProps {
  title: string
  subtitle: string
  mode: EngineMode
  model: string | null
  onOpenSidebar: () => void
}

export default function Header({ title, subtitle, mode, model, onOpenSidebar }: HeaderProps) {
  return (
    <header className="flex flex-wrap items-start gap-3 sm:gap-4">
      <button
        type="button"
        onClick={onOpenSidebar}
        aria-label="Open navigation"
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-black/5 bg-white text-ink transition hover:bg-black/5 lg:hidden"
      >
        <Menu size={18} />
      </button>

      <div className="min-w-0 flex-1">
        <h1 className="text-[22px] font-extrabold tracking-tight text-ink sm:text-[26px]">{title}</h1>
        <p className="mt-0.5 text-[12.5px] text-muted">{subtitle}</p>
      </div>

      <div className="flex items-center gap-2">
        <EngineBadge mode={mode} model={model} />
      </div>
    </header>
  )
}
