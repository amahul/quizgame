import { useEffect, useRef, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { strings } from '../i18n'

/** A modal dialog: closes on Escape or the close button, focus moves into it. */
export function Overlay({
  title,
  onClose,
  children,
  size = 'small',
}: {
  title: string
  onClose: () => void
  children: ReactNode
  /** 'large' for the big screen. */
  size?: 'small' | 'large'
}) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const large = size === 'large'
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={{ scale: 0.92, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-full w-full flex-col overflow-hidden rounded-3xl bg-indigo-950 shadow-2xl ring-1 ring-white/20 ${
          large ? 'max-w-5xl' : 'max-w-md'
        }`}
      >
        <header className={`flex items-center justify-between gap-4 border-b border-white/10 ${large ? 'px-10 py-6' : 'px-5 py-4'}`}>
          <h2 className={`font-black ${large ? 'text-5xl' : 'text-2xl'}`}>{title}</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className={`rounded-xl bg-white/15 font-bold hover:bg-white/25 ${large ? 'px-6 py-3 text-2xl' : 'px-4 py-2 text-lg'}`}
          >
            {strings.help.close}
          </button>
        </header>
        <div className={`overflow-y-auto ${large ? 'px-10 py-8' : 'px-5 py-5'}`}>{children}</div>
      </motion.div>
    </motion.div>
  )
}
