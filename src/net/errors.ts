export type TransportErrorKind = 'room-not-found' | 'room-code-taken' | 'connection-failed'

/** Transport-agnostic failure. Every transport implementation maps its own errors to these kinds. */
export class TransportError extends Error {
  readonly kind: TransportErrorKind

  constructor(kind: TransportErrorKind) {
    super(kind)
    this.name = 'TransportError'
    this.kind = kind
  }
}
