import { useSyncExternalStore } from 'react'

// Hash-based routing (#/host, #/play) so GitHub Pages never 404s on refresh.
export type Route = 'landing' | 'host' | 'play' | 'about'

export const routeHref: Record<Route, string> = {
  landing: '#/',
  host: '#/host',
  play: '#/play',
  about: '#/about',
}

function parse(hash: string): Route {
  const path = hash.replace(/^#/, '').split('?')[0]
  if (path === '/host') return 'host'
  if (path === '/play') return 'play'
  if (path === '/about') return 'about'
  return 'landing'
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

/** Reads a query parameter from the hash, e.g. `room` from `#/play?room=ABCD`. */
export function getHashParam(name: string): string | null {
  const query = window.location.hash.split('?')[1] ?? ''
  return new URLSearchParams(query).get(name)
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, () => parse(window.location.hash))
}
