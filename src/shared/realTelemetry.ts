import type { Unsubscribe } from './telemetry'
import type { SessionContext, SessionContextStatus } from './sessionContext'
import type { RealTyreStatus, RealTyreWear } from './tyres'
import type { RealFuel } from './fuel'
import type { RealErs } from './ers'

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
  // Valores brutos do mesmo ID 2; disponibilidade semântica é de apresentação.
  readonly carPosition: number
  readonly deltaToCarInFrontMSPart: number
  readonly deltaToCarInFrontMinutesPart: number
  readonly deltaToRaceLeaderMSPart: number
  readonly deltaToRaceLeaderMinutesPart: number
  readonly resultStatus: number
}

export interface RealTelemetrySnapshot {
  readonly origin: 'udp'
  readonly status: 'stopped' | 'waiting' | 'receiving' | 'stale'
  readonly identity: RealTelemetryIdentity | null
  // Incrementa apenas em transições técnicas confirmadas; não conta fins de semana.
  readonly identityRevision: number
  readonly contextStatus: SessionContextStatus
  readonly context: SessionContext | null
  // Campos ausentes ou vencidos nunca são publicados como medições atuais.
  readonly motion: RealMotion | null
  readonly lap: RealLap | null
  readonly motionFreshness: DataFreshness
  readonly lapFreshness: DataFreshness
  readonly tyreStatus: RealTyreStatus | null
  // Mesmo ID 7, identidade, timing de tyreStatus e tyreStatusFreshness.
  // Objetos separados por domínio, sem independência temporal entre eles.
  readonly fuel: RealFuel | null
  readonly ers: RealErs | null
  readonly tyreWear: RealTyreWear | null
  readonly tyreStatusFreshness: DataFreshness
  readonly tyreWearFreshness: DataFreshness
}

export type RealTelemetryListener = (snapshot: RealTelemetrySnapshot) => void

export interface RealTelemetrySource {
  start(): void
  stop(): void
  getSnapshot(): RealTelemetrySnapshot
  subscribe(listener: RealTelemetryListener): Unsubscribe
}
