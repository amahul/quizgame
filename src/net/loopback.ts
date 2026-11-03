// Wraps a HostTransport so in-page clients (dev bots) can connect alongside real
// phones. Messages are JSON round-tripped with a little latency, so bots exercise
// exactly the same protocol and code paths as phones.
import type { ClientMessage, HostMessage } from './protocol'
import type { ClientTransport, HostTransport, Unsubscribe } from './transport'

export interface LoopbackHub {
  transport: HostTransport
  /** Connects a new in-page client, like a phone opening a connection. */
  connect(): ClientTransport
}

const latency = () => 20 + Math.random() * 60
const clone = <T>(message: T): T => JSON.parse(JSON.stringify(message)) as T

function listeners<A extends unknown[]>() {
  const set = new Set<(...args: A) => void>()
  return {
    add(fn: (...args: A) => void): Unsubscribe {
      set.add(fn)
      return () => set.delete(fn)
    },
    emit: (...args: A) => set.forEach((fn) => fn(...args)),
  }
}

export function withLoopback(real: HostTransport): LoopbackHub {
  const connected = listeners<[string]>()
  const disconnected = listeners<[string]>()
  const messages = listeners<[string, unknown]>()
  const clients = new Map<string, { deliver: (m: HostMessage) => void; drop: () => void }>()
  let counter = 0

  real.onConnect((id) => connected.emit(id))
  real.onDisconnect((id) => disconnected.emit(id))
  real.onMessage((id, data) => messages.emit(id, data))

  const drop = (peerId: string) => {
    const client = clients.get(peerId)
    if (!client) return
    clients.delete(peerId)
    client.drop()
    disconnected.emit(peerId)
  }

  const transport: HostTransport = {
    roomCode: real.roomCode,
    onConnect: connected.add,
    onDisconnect: disconnected.add,
    onMessage: messages.add,
    send(peerId, message) {
      const client = clients.get(peerId)
      if (client) setTimeout(() => client.deliver(clone(message)), latency())
      else real.send(peerId, message)
    },
    broadcast(message) {
      real.broadcast(message)
      for (const peerId of clients.keys()) transport.send(peerId, message)
    },
    disconnect(peerId) {
      if (clients.has(peerId)) drop(peerId)
      else real.disconnect(peerId)
    },
    close() {
      for (const peerId of [...clients.keys()]) drop(peerId)
      real.close()
    },
  }

  function connect(): ClientTransport {
    const peerId = `loopback-${++counter}`
    const fromHost = listeners<[HostMessage]>()
    const closed = listeners<[]>()
    let open = true
    clients.set(peerId, {
      deliver: (m) => open && fromHost.emit(m),
      drop: () => {
        if (!open) return
        open = false
        closed.emit()
      },
    })
    setTimeout(() => connected.emit(peerId), latency())
    return {
      onMessage: fromHost.add,
      onClose: closed.add,
      send(message: ClientMessage) {
        if (open) setTimeout(() => clients.has(peerId) && messages.emit(peerId, clone(message)), latency())
      },
      close() {
        open = false
        if (clients.delete(peerId)) disconnected.emit(peerId)
      },
    }
  }

  return { transport, connect }
}
