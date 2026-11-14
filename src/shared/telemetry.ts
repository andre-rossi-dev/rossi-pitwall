export type Unsubscribe = () => void
export type TelemetryOrigin = 'simulated' | 'udp'
export type TelemetryStatus = 'stopped' | 'running'

export interface TelemetrySample {
  readonly metadata: {
    readonly sessionId: string
    // Tempo e frame pertencem à fonte; podem retroceder após um flashback.
    readonly frameId: number
    readonly sessionTimeSeconds: number
    readonly origin: TelemetryOrigin
    // null significa que nenhum protocolo UDP foi identificado.
    readonly protocolVersion: string | null
  }
  readonly speedKph: number
  readonly gear: number
  readonly lap: number
}

export interface TelemetrySnapshot {
  readonly origin: TelemetryOrigin
  readonly status: TelemetryStatus
  readonly sample: TelemetrySample | null
}

export type TelemetryListener = (snapshot: TelemetrySnapshot) => void

export interface TelemetrySource {
  start(): void
  stop(): void
  getSnapshot(): TelemetrySnapshot
  // A inscrição entrega imediatamente o estado atual; o chamador deve cancelá-la.
  subscribe(listener: TelemetryListener): Unsubscribe
}
