import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

const variants = {
  primary: 'from-emerald-600 to-green-700 shadow-green-900/50',
  danger: 'from-rose-600 to-red-700 shadow-red-900/50',
  neutral: 'from-white/25 to-white/10 shadow-black/30',
}

/** A large button for the big screen, readable and clickable from a distance. */
export function HostButton({
  onClick,
  children,
  variant = 'primary',
  disabled = false,
}: {
  onClick: () => void
  children: ReactNode
  variant?: keyof typeof variants
  disabled?: boolean
}) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? undefined : { scale: 1.05 }}
      whileTap={disabled ? undefined : { scale: 0.95 }}
      className={`rounded-3xl bg-gradient-to-br px-12 py-5 text-4xl font-black shadow-2xl disabled:opacity-30 ${variants[variant]}`}
    >
      {children}
    </motion.button>
  )
}
