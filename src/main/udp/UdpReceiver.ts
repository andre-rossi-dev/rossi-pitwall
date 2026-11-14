import { createSocket } from 'node:dgram'
import type { Socket } from 'node:dgram'
import type { UdpDiagnosticListener, UdpDiagnosticSnapshot, UdpDiagnosticSource } from '../../shared/udp'
import type { Unsubscribe } from '../../shared/telemetry'
import { DEFAULT_UDP_PORT, UDP_ADDRESS } from './config'
import { inspectHeader } from './inspectHeader'

export const DIAGNOSTIC_INTERVAL_MS = 250
export const UDP_IDLE_MS = 3000

export class UdpReceiver implements UdpDiagnosticSource {
  private socket: Socket | undefined
  private timer: ReturnType<typeof setInterval> | undefined
  private lifecycle = Promise.resolve()
  private closing: Promise<void> | undefined
  private readonly listeners = new Set<UdpDiagnosticListener>()
  private readonly datagramListeners = new Set<(datagram: Buffer) => void>()
  private lastArrival = 0
  private dirty = false
  private snapshot: UdpDiagnosticSnapshot

  // Porta 0 é reservada aos testes locais (porta efêmera); configuração pública: 1–65535.
  constructor(private readonly port: number | null = DEFAULT_UDP_PORT) {
    this.snapshot = this.initialSnapshot()
  }

  getSnapshot(): UdpDiagnosticSnapshot {
    return this.snapshot
  }

  subscribe(listener: UdpDiagnosticListener): Unsubscribe {
    const subscription: UdpDiagnosticListener = (snapshot) => listener(snapshot)
    this.listeners.add(subscription)
    subscription(this.snapshot)
    return () => { this.listeners.delete(subscription) }
  }

  start(): Promise<void> {
    // Serializa start/stop, inclusive quando o bind ainda está pendente.
    this.lifecycle = this.lifecycle.then(() => this.open())
    return this.lifecycle
  }

  // Uso interno do Main: o mesmo socket alimenta diagnóstico e decodificação.
  // O consumidor lê sincronamente e não deve modificar nem reter o Buffer.
  subscribeDatagrams(listener: (datagram: Buffer) => void): Unsubscribe {
    const subscription = (datagram: Buffer): void => listener(datagram)
    this.datagramListeners.add(subscription)
    return () => { this.datagramListeners.delete(subscription) }
  }

  stop(): Promise<void> {
    this.lifecycle = this.lifecycle.then(async () => {
      await this.closeSocket()
      if (this.snapshot.status !== 'stopped') {
        this.update({ status: 'stopped' })
        this.publish()
      }
    })
    return this.lifecycle
  }

  private initialSnapshot(): UdpDiagnosticSnapshot {
    return Object.freeze({
      address: UDP_ADDRESS, port: this.port, status: 'stopped',
      packetsReceived: 0, bytesReceived: 0, headers2025: 0, headers2026: 0,
      invalidPackets: 0, unsupportedPackets: 0,
      lastReceivedAt: null, lastPacket: null, error: null
    })
  }

  private async open(): Promise<void> {
    await this.closing
    if (this.socket) return
    this.snapshot = this.initialSnapshot()
    const port = this.port
    if (port === null || !Number.isInteger(port) || port < 0 || port > 65535) {
      this.update({ status: 'error', error: 'ROSSI_UDP_PORT inválida. Use um inteiro de 1 a 65535.' })
      this.publish()
      return
    }

    this.update({ status: 'starting' })
    this.publish()
    await new Promise<void>((resolve) => {
      const onError = (error: NodeJS.ErrnoException): void => {
        this.update({
          status: 'error',
          error: error.code === 'EADDRINUSE'
            ? `Porta ${this.port} ocupada (EADDRINUSE). Libere a porta ou configure ROSSI_UDP_PORT e reinicie.`
            : `Falha UDP (${error.code ?? 'UNKNOWN'}). Verifique a configuração e reinicie.`
        })
        this.publish()
        void this.closeSocket().then(resolve)
      }
      try {
        const socket = createSocket('udp4')
        this.socket = socket
        socket.on('error', onError)
        socket.on('message', this.receive)
        socket.once('listening', () => {
          this.update({ status: 'listening', port: socket.address().port })
          this.timer = setInterval(() => this.flush(), DIAGNOSTIC_INTERVAL_MS)
          this.publish()
          resolve()
        })
        socket.bind({ address: UDP_ADDRESS, port, exclusive: true })
      } catch (error) {
        onError(error as NodeJS.ErrnoException)
      }
    })
  }

  private readonly receive = (datagram: Buffer): void => {
    const lastPacket = Object.freeze(inspectHeader(datagram))
    const current = this.snapshot
    this.lastArrival = performance.now()
    this.update({
      status: 'receiving', packetsReceived: current.packetsReceived + 1,
      bytesReceived: current.bytesReceived + datagram.length,
      headers2025: current.headers2025 + Number(lastPacket.kind === 'recognized' && lastPacket.packetFormat === 2025),
      headers2026: current.headers2026 + Number(lastPacket.kind === 'recognized' && lastPacket.packetFormat === 2026),
      invalidPackets: current.invalidPackets + Number(lastPacket.kind === 'invalid'),
      unsupportedPackets: current.unsupportedPackets + Number(lastPacket.kind === 'unsupported'),
      lastReceivedAt: Date.now(), lastPacket
    })
    this.datagramListeners.forEach((listener) => listener(datagram))
  }

  private flush(): void {
    if (this.snapshot.status === 'receiving' && performance.now() - this.lastArrival >= UDP_IDLE_MS) {
      this.update({ status: 'idle' })
    }
    if (this.dirty) this.publish()
  }

  private closeSocket(): Promise<void> {
    if (this.closing) return this.closing
    clearInterval(this.timer)
    this.timer = undefined
    this.dirty = false
    const socket = this.socket
    if (!socket) return Promise.resolve()
    socket.removeListener('message', this.receive)
    // O handler de error permanece até o fechamento, inclusive após falha de bind.
    this.closing = new Promise<void>((resolve) => {
      const closed = (): void => {
        socket.removeAllListeners()
        this.socket = undefined
        resolve()
      }
      try { socket.close(closed) } catch { closed() }
    }).finally(() => { this.closing = undefined })
    return this.closing
  }

  private update(patch: Partial<UdpDiagnosticSnapshot>): void {
    this.snapshot = Object.freeze({ ...this.snapshot, ...patch })
    this.dirty = true
  }

  private publish(): void {
    this.dirty = false
    this.listeners.forEach((listener) => listener(this.snapshot))
  }
}
