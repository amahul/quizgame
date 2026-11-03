import Peer, { type DataConnection } from 'peerjs'
import { TransportError } from './errors'
import type { HostMessage } from './protocol'
import type { ClientTransport, HostTransport, TransportFactory, Unsubscribe } from './transport'

// Namespaces our peer IDs on the shared public PeerJS broker.
const PEER_PREFIX = 'quizgame-'
const CONNECT_TIMEOUT_MS = 10_000
/** How often the host checks that it's still registered with the broker. */
const BROKER_CHECK_MS = 5_000

const peerIdFor = (roomCode: string) => PEER_PREFIX + roomCode.toUpperCase()

type PeerErrorLike = { type?: string }

function listeners<A extends unknown[]>() {
  const set = new Set<(...args: A) => void>()
  return {
    add(fn: (...args: A) => void): Unsubscribe {
      set.add(fn)
      return () => set.delete(fn)
    },
    emit(...args: A) {
      set.forEach((fn) => fn(...args))
    },
  }
}

function safeSend(conn: DataConnection | undefined, message: unknown) {
  try {
    if (conn?.open) void conn.send(message)
  } catch (err) {
    console.warn('[net] send failed', err)
  }
}

function openPeer(id?: string): Promise<Peer> {
  return new Promise((resolve, reject) => {
    const peer = id ? new Peer(id) : new Peer()
    const fail = (error: TransportError) => {
      clearTimeout(timer)
      peer.destroy()
      reject(error)
    }
    const onError = (err: PeerErrorLike) =>
      fail(new TransportError(err.type === 'unavailable-id' ? 'room-code-taken' : 'connection-failed'))
    const timer = setTimeout(() => fail(new TransportError('connection-failed')), CONNECT_TIMEOUT_MS)
    peer.once('error', onError)
    peer.once('open', () => {
      clearTimeout(timer)
      peer.off('error', onError)
      resolve(peer)
    })
  })
}

async function createHost(roomCode: string): Promise<HostTransport> {
  const peer = await openPeer(peerIdFor(roomCode))
  const conns = new Map<string, DataConnection>()
  const connected = listeners<[string]>()
  const disconnected = listeners<[string]>()
  const messages = listeners<[string, unknown]>()

  peer.on('error', (err) => console.warn('[net] host peer error', err.type))

  // Existing data channels survive a lost broker connection, but new phones can
  // only find the room while the host is registered, so keep re-registering.
  const brokerCheck = setInterval(() => {
    if (peer.disconnected && !peer.destroyed) peer.reconnect()
  }, BROKER_CHECK_MS)

  peer.on('connection', (conn) => {
    let isOpen = false
    const onClosed = () => {
      if (!isOpen) return
      isOpen = false
      if (conns.get(conn.peer) === conn) conns.delete(conn.peer)
      disconnected.emit(conn.peer)
    }
    conn.on('open', () => {
      isOpen = true
      conns.set(conn.peer, conn)
      connected.emit(conn.peer)
    })
    conn.on('data', (data) => messages.emit(conn.peer, data))
    conn.on('close', onClosed)
    conn.on('error', onClosed)
  })

  return {
    roomCode,
    onConnect: connected.add,
    onDisconnect: disconnected.add,
    onMessage: messages.add,
    send: (peerId, message: HostMessage) => safeSend(conns.get(peerId), message),
    broadcast: (message) => conns.forEach((conn) => safeSend(conn, message)),
    disconnect: (peerId) => conns.get(peerId)?.close(),
    close: () => {
      clearInterval(brokerCheck)
      peer.destroy()
    },
  }
}

async function joinRoom(roomCode: string): Promise<ClientTransport> {
  const peer = await openPeer()

  const conn = await new Promise<DataConnection>((resolve, reject) => {
    const conn = peer.connect(peerIdFor(roomCode), { reliable: true })
    const fail = (error: TransportError) => {
      clearTimeout(timer)
      peer.destroy()
      reject(error)
    }
    const onError = (err: PeerErrorLike) =>
      fail(new TransportError(err.type === 'peer-unavailable' ? 'room-not-found' : 'connection-failed'))
    const timer = setTimeout(() => fail(new TransportError('connection-failed')), CONNECT_TIMEOUT_MS)
    peer.once('error', onError)
    conn.once('open', () => {
      clearTimeout(timer)
      peer.off('error', onError)
      resolve(conn)
    })
  })

  const messages = listeners<[HostMessage]>()
  const closed = listeners<[]>()
  let isClosed = false
  const onClosed = () => {
    if (isClosed) return
    isClosed = true
    peer.destroy()
    closed.emit()
  }
  conn.on('data', (data) => messages.emit(data as HostMessage))
  conn.on('close', onClosed)
  conn.on('error', onClosed)
  peer.on('error', onClosed)

  return {
    onMessage: messages.add,
    onClose: closed.add,
    send: (message) => safeSend(conn, message),
    close: () => {
      isClosed = true
      peer.destroy()
    },
  }
}

export const peerJsTransport: TransportFactory = { createHost, joinRoom }
