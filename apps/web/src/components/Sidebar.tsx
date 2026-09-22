import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import Logo from './Logo'
import { navItems, type ViewId } from '../lib/nav'
import { useMediaQuery } from '../lib/useMediaQuery'

interface SidebarProps {
  activeId: ViewId
  onNavigate: (id: ViewId) => void
  isOpen: boolean
  onClose: () => void
  footer?: React.ReactNode
}

/** Below this the sidebar is a modal drawer; at or above it, permanent furniture. */
const DESKTOP_QUERY = '(min-width: 1024px)'

export default function Sidebar({ activeId, onNavigate, isOpen, onClose, footer }: SidebarProps) {
  const asideRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<Element | null>(null)

  // Escape closes the drawer, and focus is moved into it on open and returned
  // to the trigger on close. Without this the drawer is a keyboard dead end.
  useEffect(() => {
    if (!isOpen) return

    returnFocusRef.current = document.activeElement
    closeRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab' || !asideRef.current) return

      // Simple focus trap: the drawer covers the screen while open, so
      // tabbing out of it would land on inert content behind the overlay.
      const focusable = asideRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (returnFocusRef.current instanceof HTMLElement) returnFocusRef.current.focus()
    }
  }, [isOpen, onClose])

  // On mobile the closed drawer is translated off-screen but still in the
  // DOM, so it must be removed from the tab order or a keyboard user tabs
  // into five invisible buttons.
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const hiddenFromAT = !isOpen && !isDesktop

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-ink/40 backdrop-blur-[2px] lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        ref={asideRef}
        aria-hidden={hiddenFromAT || undefined}
        // `inert` is not in React 18's prop types yet; the attribute itself is
        // what removes the off-screen drawer from the tab order.
        {...(hiddenFromAT ? ({ inert: '' } as Record<string, string>) : {})}
        className={`fixed inset-y-0 left-0 z-40 flex w-[248px] shrink-0 flex-col overflow-y-auto rounded-r-[26px] bg-ink px-4 pb-5 pt-6 transition-transform duration-300 lg:static lg:z-auto lg:h-full lg:translate-x-0 lg:rounded-[22px] ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="mb-7 flex items-center justify-between px-2">
          <div className="flex items-center gap-2.5">
            <Logo size={30} />
            <span className="text-[17px] font-bold tracking-tight text-white">Tether</span>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="rounded-lg p-1 text-white/70 transition hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-lime lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        <nav aria-label="Main navigation" className="flex-1 overflow-y-auto">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = item.id === activeId
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onNavigate(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    title={item.hint}
                    className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13.5px] font-medium transition focus-visible:ring-2 focus-visible:ring-lime ${
                      isActive ? 'bg-lime text-ink' : 'text-white/70 hover:bg-white/[0.07] hover:text-white'
                    }`}
                  >
                    <Icon size={17} strokeWidth={1.9} aria-hidden="true" />
                    <span className="flex-1 text-left">{item.label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        {footer}
      </aside>
    </>
  )
}
