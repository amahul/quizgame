// The host's single music element. It's routed through the shared AudioContext so
// an analyser can drive the equalizer (blob URLs are same-origin, so that's allowed).
import { getAudioContext, getOutput } from '..'

let element: HTMLAudioElement | null = null
let analyser: AnalyserNode | null = null

/** Thrown when the browser won't play until the host clicks something. */
export class NeedsGestureError extends Error {
  constructor() {
    super('Audio needs a user gesture')
    this.name = 'NeedsGestureError'
  }
}

function audio(): HTMLAudioElement {
  if (!element) {
    element = new Audio()
    element.preload = 'auto'
    const ctx = getAudioContext()
    analyser = ctx.createAnalyser()
    analyser.fftSize = 128
    analyser.smoothingTimeConstant = 0.75
    ctx.createMediaElementSource(element).connect(analyser).connect(getOutput())
  }
  return element
}

export function getAnalyser(): AnalyserNode | null {
  return analyser
}

async function ensureRunning(): Promise<void> {
  const ctx = getAudioContext()
  // A function, because the state changes while we await.
  const running = () => ctx.state === 'running'
  if (running()) return
  // Without a recent click, resume() never settles; don't wait for it forever.
  await Promise.race([ctx.resume().catch(() => {}), new Promise((r) => setTimeout(r, 300))])
  if (!running()) throw new NeedsGestureError()
}

/** Plays `url` from `offsetSeconds`. Resolves once audio is actually playing. */
export async function playClip(url: string, offsetSeconds: number): Promise<void> {
  const el = audio()
  await ensureRunning()
  if (el.src !== url) el.src = url
  // Only seek if we've drifted, so a resume doesn't stutter.
  if (Math.abs(el.currentTime - offsetSeconds) > 0.5) el.currentTime = offsetSeconds
  try {
    await el.play()
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotAllowedError') throw new NeedsGestureError()
    throw err
  }
}

export function pauseMusic(): void {
  element?.pause()
}

export function isMusicPlaying(): boolean {
  return Boolean(element && !element.paused)
}
