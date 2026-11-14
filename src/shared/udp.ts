import type { Unsubscribe } from './telemetry'

export type UdpStatus = 'stopped' | 'starting' | 'listening' | 'receiving' | 'idle' | 'error'

export type HeaderInspection =
  | { readonly kind: 'invalid'; readonly reason: string }
  | { readonly kind: 'unsupported'; readonly packetFormat: number }
  | {
    readonly kind: 'recognized'
    readonly packetFormat: 2025 | 2026
    readonly packetId: number
    readonly packetVersion: number
    readonly sessionTime: number
    readonly frameId: number
  }

export interface UdpDiagnosticSnapshot {
  readonly address: string
  readonly port: number | null
  readonly status: UdpStatus
  readonly packetsReceived: number
  readonly bytesReceived: number
  readonly headers2025: number
  readonly headers2026: number
  readonly invalidPackets: number
  readonly unsupportedPackets: number
  readonly lastReceivedAt: number | null
  readonly lastPacket: HeaderInspection | null
  readonly error: string | null
}

export type UdpDiagnosticListener = (snapshot: UdpDiagnosticSnapshot) => void

// Diagnóstico permanece independente da camada de decodificação de métricas.
export interface UdpDiagnosticSource {
  start(): Promise<void>
  stop(): Promise<void>
  getSnapshot(): UdpDiagnosticSnapshot
  subscribe(listener: UdpDiagnosticListener): Unsubscribe
}
