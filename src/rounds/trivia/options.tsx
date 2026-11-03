import type { ReactNode } from 'react'

// The four answer slots: each has a color and a shape so they can be told apart
// without reading, and by colorblind players.
// Text colors are chosen for at least 4.5:1 contrast against each background.
export const OPTION_STYLES = [
  { bg: 'bg-red-600', text: 'text-white', bar: 'bg-red-200', shape: 'triangle' },
  { bg: 'bg-blue-600', text: 'text-white', bar: 'bg-blue-200', shape: 'diamond' },
  { bg: 'bg-amber-400', text: 'text-amber-950', bar: 'bg-amber-900', shape: 'circle' },
  { bg: 'bg-green-700', text: 'text-white', bar: 'bg-green-200', shape: 'square' },
] as const

type ShapeName = (typeof OPTION_STYLES)[number]['shape']

const paths: Record<ShapeName, ReactNode> = {
  triangle: <path d="M12 3 L22 20 H2 Z" />,
  diamond: <path d="M12 2 L22 12 L12 22 L2 12 Z" />,
  circle: <circle cx="12" cy="12" r="10" />,
  square: <rect x="3" y="3" width="18" height="18" rx="1.5" />,
}

export function OptionShape({ index, className }: { index: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      {paths[OPTION_STYLES[index].shape]}
    </svg>
  )
}
