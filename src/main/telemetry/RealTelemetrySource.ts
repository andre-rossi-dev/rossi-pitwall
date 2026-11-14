import type {
  DataFreshness, RealLap, RealMotion, RealTelemetryIdentity,
  RealTelemetryListener, RealTelemetrySnapshot, RealTelemetrySource as Source
} from '../../shared/realTelemetry'
import type { Unsubscribe } from '../../shared/telemetry'
import type { UdpReceiver } from '../udp/UdpReceiver'
import { decodeTelemetry } from '../udp/decodeTelemetry'

export const REAL_TELEMETRY_INTERVAL_MS = 100
export const REAL_TELEMETRY_STALE_MS = 3000

interface Received<T> { readonly data: T; readonly at: number }

export class RealTelemetrySource implements Source {
  private timer: ReturnType<typeof setInterval> | undefined
  private cancelPackets: Unsubscribe | undefined
  private cancelDiagnostics: Unsubscribe | undefined
  private readonly listeners = new Set<RealTelemetryListener>()
  private identity: RealTelemetryIdentity | null = null
  private motion: Received<RealMotion> | null = null
  private lap: Received<RealLap> | null = null
  private dirty = false
  private running = false
  private published: RealTelemetrySnapshot | null = null

  constructor(
    private readonly receiver: Pick<UdpReceiver, 'subscribeDatagrams' | 'subscribe'>,
    private readonly now: () => number = () => performance.now()
  ) {}

  start(): void {
    if (this.running) return
    this.running = true
    this.clear()
    this.cancelPackets = this.receiver.subscribeDatagrams(this.receive)
    this.cancelDiagnostics = this.receiver.subscribe(({ status }) => {
      if (status === 'starting' || status === 'stopped' || status === 'error') this.clear()
    })
    this.timer = setInterval(() => this.flush(), REAL_TELEMETRY_INTERVAL_MS)
    this.publish(this.getSnapshot())
  }

  stop(): void {
    if (!this.running) return
    this.cancelPackets?.()
    this.cancelDiagnostics?.()
    this.cancelPackets = undefined
    this.cancelDiagnostics = undefined
    clearInterval(this.timer)
    this.timer = undefined
    this.running = false
    this.clear()
    this.publish(this.getSnapshot())
  }

  subscribe(listener: RealTelemetryListener): Unsubscribe {
    const subscription: RealTelemetryListener = (snapshot) => listener(snapshot)
    this.listeners.add(subscription)
    subscription(this.getSnapshot())
    return () => { this.listeners.delete(subscription) }
  }

  getSnapshot(): RealTelemetrySnapshot {
    const now = this.now()
    const freshness = (received: Received<unknown> | null): DataFreshness =>
      received === null ? 'waiting' : now - received.at >= REAL_TELEMETRY_STALE_MS ? 'stale' : 'fresh'
    const motionFreshness = freshness(this.motion)
    const lapFreshness = freshness(this.lap)
    const status = !this.running ? 'stopped'
      : motionFreshness === 'stale' || lapFreshness === 'stale' ? 'stale'
        : motionFreshness === 'fresh' || lapFreshness === 'fresh' ? 'receiving' : 'waiting'
    return Object.freeze({
      origin: 'udp', status, identity: this.identity, motionFreshness, lapFreshness,
      motion: motionFreshness === 'fresh' ? this.motion!.data : null,
      lap: lapFreshness === 'fresh' ? this.lap!.data : null
    })
  }

  private readonly receive = (datagram: Buffer): void => {
    const packet = decodeTelemetry(datagram)
    if (!packet) return
    if (packet.sessionId !== this.identity?.sessionId || packet.packetFormat !== this.identity.packetFormat ||
        packet.playerCarIndex !== this.identity.playerCarIndex) {
      this.clear()
      this.identity = Object.freeze({
        sessionId: packet.sessionId, packetFormat: packet.packetFormat, playerCarIndex: packet.playerCarIndex
      })
    }
    const at = this.now()
    if (packet.kind === 'motion') this.motion = { data: Object.freeze(packet.data), at }
    else this.lap = { data: Object.freeze(packet.data), at }
    this.dirty = true
  }

  private clear(): void {
    this.identity = null
    this.motion = null
    this.lap = null
    this.dirty = true
  }

  private flush(): void {
    const snapshot = this.getSnapshot()
    if (this.dirty || snapshot.motionFreshness !== this.published?.motionFreshness ||
        snapshot.lapFreshness !== this.published?.lapFreshness) this.publish(snapshot)
  }

  private publish(snapshot: RealTelemetrySnapshot): void {
    this.dirty = false
    this.published = snapshot
    this.listeners.forEach((listener) => listener(snapshot))
  }
}
