import type { Unsubscribe } from './telemetry'

export type DataFreshness = 'waiting' | 'fresh' | 'stale'

export interface RealTelemetryIdentity {
  readonly sessionId: string
  readonly packetFormat: 2025 | 2026
  readonly playerCarIndex: number
}

export interface PacketTiming {
  readonly frameId: number
  readonly overallFrameId: number
  readonly sessionTimeSeconds: number
}

export interface RealMotion extends PacketTiming {
  readonly speedKph: number
  readonly gear: number
}

export interface RealLap extends PacketTiming {
  readonly number: number
}

export interface RealTelemetrySnapshot {
  readonly origin: 'udp'
  readonly status: 'stopped' | 'waiting' | 'receiving' | 'stale'
  readonly identity: RealTelemetryIdentity | null
  // Campos ausentes ou vencidos nunca são publicados como medições atuais.
  readonly motion: RealMotion | null
  readonly lap: RealLap | null
  readonly motionFreshness: DataFreshness
  readonly lapFreshness: DataFreshness
}

export type RealTelemetryListener = (snapshot: RealTelemetrySnapshot) => void

export interface RealTelemetrySource {
  start(): void
  stop(): void
  getSnapshot(): RealTelemetrySnapshot
  subscribe(listener: RealTelemetryListener): Unsubscribe
}
