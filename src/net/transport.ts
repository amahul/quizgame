// The only networking surface game code may depend on. Swap the implementation
// (PeerJS today; Socket.IO or Firebase later) without touching game logic or UI.
import type { ClientMessage, HostMessage } from './protocol'

export type Unsubscribe = () => void

/** Runs in the host's browser. Accepts player connections. */
export interface HostTransport {
  readonly roomCode: string
  onConnect(handler: (peerId: string) => void): Unsubscribe
  onDisconnect(handler: (peerId: string) => void): Unsubscribe
  /** Data is untrusted: validate it with parseClientMessage before use. */
  onMessage(handler: (peerId: string, data: unknown) => void): Unsubscribe
  send(peerId: string, message: HostMessage): void
  broadcast(message: HostMessage): void
  /** Closes one player's connection. */
  disconnect(peerId: string): void
  close(): void
}

/** Runs on a player's phone. Talks only to the host. */
export interface ClientTransport {
  onMessage(handler: (message: HostMessage) => void): Unsubscribe
  /** Fires once if the connection drops. Not fired after close(). */
  onClose(handler: () => void): Unsubscribe
  send(message: ClientMessage): void
  close(): void
}

/** Both methods reject with a TransportError. */
export interface TransportFactory {
  /** Claims `roomCode`. Rejects with 'room-code-taken' if another host has it. */
  createHost(roomCode: string): Promise<HostTransport>
  /** Rejects with 'room-not-found' or 'connection-failed'. */
  joinRoom(roomCode: string): Promise<ClientTransport>
}

export { TransportError, type TransportErrorKind } from './errors'
export { peerJsTransport as transport } from './peerjs'
