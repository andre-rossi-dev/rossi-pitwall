import type {
  DataFreshness, RealLap, RealMotion, RealTelemetryIdentity,
  RealTelemetryListener, RealTelemetrySnapshot, RealTelemetrySource as Source
} from '../../shared/realTelemetry'
import type { Unsubscribe } from '../../shared/telemetry'
import type { UdpReceiver } from '../udp/UdpReceiver'
import { decodeTelemetry } from '../udp/decodeTelemetry'
import type { DecodedTelemetry } from '../udp/decodeTelemetry'
import { decodeSession } from '../udp/decodeSession'
import type { DecodedSession } from '../udp/decodeSession'
import { decodeTyres } from '../udp/decodeTyres'
import type { DecodedTyres } from '../udp/decodeTyres'
import type { RealTyreStatus, RealTyreWear } from '../../shared/tyres'
import type { RealFuel } from '../../shared/fuel'
import type { RealErs } from '../../shared/ers'
import type { SessionContext, SessionDetails, SessionContextStatus } from '../../shared/sessionContext'

export const REAL_TELEMETRY_INTERVAL_MS = 100
export const REAL_TELEMETRY_STALE_MS = 3000
export const IDENTITY_CONFIRMATION_MS = 1000
export const RETIRED_SESSION_LIMIT = 8

interface Received<T> { readonly data: T; readonly at: number }
interface ReceivedCarStatus extends Received<RealTyreStatus> {
  readonly fuel: RealFuel
  readonly ers: RealErs
}
type DecodedPacket = DecodedTelemetry | DecodedSession | DecodedTyres
const contextFields = [
  'sessionType', 'trackId', 'seasonLinkIdentifier', 'weekendLinkIdentifier', 'sessionLinkIdentifier'
] as const

function conflictingContext(first: SessionDetails, second: SessionDetails): boolean {
  return contextFields.some((field) => first[field] !== null && second[field] !== null && first[field] !== second[field])
}

function retainKnownContext(previous: SessionDetails | null, next: SessionDetails): SessionDetails {
  // Referências internas para detectar contradições; nunca preenchem o snapshot.
  return {
    sessionType: previous?.sessionType ?? next.sessionType,
    trackId: previous?.trackId ?? next.trackId,
    seasonLinkIdentifier: previous?.seasonLinkIdentifier ?? next.seasonLinkIdentifier,
    weekendLinkIdentifier: previous?.weekendLinkIdentifier ?? next.weekendLinkIdentifier,
    sessionLinkIdentifier: previous?.sessionLinkIdentifier ?? next.sessionLinkIdentifier
  }
}

interface Candidate {
  readonly identity: RealTelemetryIdentity
  readonly startedAt: number
  readonly packets: Partial<Record<DecodedPacket['kind'], Received<DecodedPacket>>>
  contextBinding: SessionDetails | null
}

function sameIdentity(first: RealTelemetryIdentity, second: RealTelemetryIdentity): boolean {
  return first.sessionId === second.sessionId && first.packetFormat === second.packetFormat &&
    first.playerCarIndex === second.playerCarIndex
}

function isNewerFrame(next: number, previous: number): boolean {
  // >>> 0 converte a diferença para uint32 (aritmética modular). Exatamente
  // meia faixa é ambígua; não inferimos ordem nem aceitamos duplicações.
  const distance = (next - previous) >>> 0
  return distance > 0 && distance < 0x80000000
}

export class RealTelemetrySource implements Source {
  private timer: ReturnType<typeof setInterval> | undefined
  private cancelPackets: Unsubscribe | undefined
  private cancelDiagnostics: Unsubscribe | undefined
  private readonly listeners = new Set<RealTelemetryListener>()
  private identity: RealTelemetryIdentity | null = null
  private motion: Received<RealMotion> | null = null
  private lap: Received<RealLap> | null = null
  private tyreStatus: ReceivedCarStatus | null = null
  private tyreWear: Received<RealTyreWear> | null = null
  private context: Received<SessionContext> | null = null
  private contextBinding: SessionDetails | null = null
  private contextConflict = false
  private identityRevision = 0
  private candidate: Candidate | null = null
  private readonly retiredSessions: string[] = []
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
    const tyreStatusFreshness = freshness(this.tyreStatus)
    const tyreWearFreshness = freshness(this.tyreWear)
    const contextFreshness = freshness(this.context)
    const contextStatus: SessionContextStatus = this.contextConflict || contextFreshness === 'stale'
      ? 'unavailable' : this.context && contextFields.some((field) => this.context!.data[field] !== null)
        ? 'identified' : 'unidentified'
    const status = !this.running ? 'stopped'
      : motionFreshness === 'stale' || lapFreshness === 'stale' ? 'stale'
        : motionFreshness === 'fresh' || lapFreshness === 'fresh' ? 'receiving' : 'waiting'
    return Object.freeze({
      origin: 'udp', status, identity: this.identity, motionFreshness, lapFreshness,
      identityRevision: this.identityRevision, contextStatus,
      tyreStatusFreshness, tyreWearFreshness,
      tyreStatus: tyreStatusFreshness === 'fresh' ? this.tyreStatus!.data : null,
      fuel: tyreStatusFreshness === 'fresh' ? this.tyreStatus!.fuel : null,
      ers: tyreStatusFreshness === 'fresh' ? this.tyreStatus!.ers : null,
      tyreWear: tyreWearFreshness === 'fresh' ? this.tyreWear!.data : null,
      context: contextStatus === 'identified' ? this.context!.data : null,
      motion: motionFreshness === 'fresh' ? this.motion!.data : null,
      lap: lapFreshness === 'fresh' ? this.lap!.data : null
    })
  }

  private readonly receive = (datagram: Buffer): void => {
    const packet = decodeTelemetry(datagram) ?? decodeSession(datagram) ?? decodeTyres(datagram)
    if (!packet) return
    if (this.retiredSessions.includes(packet.sessionId)) return
    const at = this.now()
    const identity = Object.freeze({
      sessionId: packet.sessionId, packetFormat: packet.packetFormat, playerCarIndex: packet.playerCarIndex
    })
    if (!this.identity) this.identity = identity
    if (!sameIdentity(this.identity, identity)) {
      if (!this.candidate || !sameIdentity(this.candidate.identity, identity) ||
          at - this.candidate.startedAt >= IDENTITY_CONFIRMATION_MS) {
        this.candidate = { identity, startedAt: at, packets: {}, contextBinding: null }
      }
      const candidate = this.candidate
      const previous = candidate.packets[packet.kind]
      if (previous && !isNewerFrame(packet.data.overallFrameId, previous.data.data.overallFrameId)) return
      if (packet.kind === 'session') {
        if (candidate.contextBinding && conflictingContext(candidate.contextBinding, packet.data)) {
          // Contextos contraditórios não formam evidência coerente de uma candidata.
          this.candidate = null
          return
        }
        candidate.contextBinding = retainKnownContext(candidate.contextBinding, packet.data)
      }
      candidate.packets[packet.kind] = { data: packet, at }
      // Confirma somente com avanço no MESMO grupo; IDs 1, 2, 6, 7 e 10 não
      // precisam compartilhar frames, frequência ou estar todos disponíveis.
      if (!previous) return
      if (this.identity.sessionId !== identity.sessionId) {
        this.retiredSessions.push(this.identity.sessionId)
        if (this.retiredSessions.length > RETIRED_SESSION_LIMIT) this.retiredSessions.shift()
      }
      this.identity = identity
      this.motion = null
      this.lap = null
      this.tyreStatus = null
      this.tyreWear = null
      this.context = null
      this.contextBinding = candidate.contextBinding
      this.contextConflict = false
      this.identityRevision++
      this.candidate = null
      for (const received of Object.values(candidate.packets)) this.apply(received.data, received.at)
      return
    }
    const previous = this.previousGroup(packet.kind)
    if (previous && !isNewerFrame(packet.data.overallFrameId, previous.data.overallFrameId)) return
    this.candidate = null
    this.apply(packet, at)
  }

  private apply(packet: DecodedPacket, at: number): void {
    if (packet.kind === 'motion') this.motion = { data: Object.freeze(packet.data), at }
    else if (packet.kind === 'lap') this.lap = { data: Object.freeze(packet.data), at }
    else if (packet.kind === 'tyreStatus') {
      // Uma atribuição substitui todos os domínios do ID 7, inclusive campos
      // inválidos (null); nenhum valor de uma amostra anterior é reaproveitado.
      this.tyreStatus = {
        data: Object.freeze(packet.data), at,
        fuel: Object.freeze(packet.fuel), ers: Object.freeze(packet.ers)
      }
    }
    else if (packet.kind === 'tyreWear') this.tyreWear = { data: Object.freeze(packet.data), at }
    else {
      const previous = this.contextBinding
      if (previous && conflictingContext(previous, packet.data)) this.contextConflict = true
      // Guarda só referências conhecidas desta identidade. null não apaga uma
      // referência anterior nem transforma um vínculo conflitante em retomada.
      this.contextBinding = retainKnownContext(previous, packet.data)
      this.context = { data: Object.freeze(packet.data), at }
    }
    this.dirty = true
  }

  private clear(): void {
    this.identity = null
    this.motion = null
    this.lap = null
    this.tyreStatus = null
    this.tyreWear = null
    this.context = null
    this.contextBinding = null
    this.contextConflict = false
    this.identityRevision = 0
    this.candidate = null
    this.retiredSessions.length = 0
    this.dirty = true
  }

  private flush(): void {
    const snapshot = this.getSnapshot()
    if (this.dirty || snapshot.motionFreshness !== this.published?.motionFreshness ||
        snapshot.lapFreshness !== this.published?.lapFreshness ||
        snapshot.tyreStatusFreshness !== this.published?.tyreStatusFreshness ||
        snapshot.tyreWearFreshness !== this.published?.tyreWearFreshness ||
        snapshot.contextStatus !== this.published?.contextStatus) this.publish(snapshot)
  }

  private publish(snapshot: RealTelemetrySnapshot): void {
    this.dirty = false
    this.published = snapshot
    this.listeners.forEach((listener) => listener(snapshot))
  }

  private previousGroup(kind: DecodedPacket['kind']) {
    switch (kind) {
      case 'motion': return this.motion
      case 'lap': return this.lap
      case 'session': return this.context
      case 'tyreStatus': return this.tyreStatus
      case 'tyreWear': return this.tyreWear
    }
  }
}
