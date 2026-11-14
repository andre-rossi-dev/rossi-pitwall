import type { TelemetryListener, Unsubscribe } from './telemetry'
import type { UdpDiagnosticListener } from './udp'

export const TELEMETRY_CHANNEL = 'pitwall:telemetry' as const
export const UDP_DIAGNOSTICS_CHANNEL = 'pitwall:udp-diagnostics' as const
export const UDP_DIAGNOSTICS_REQUEST_CHANNEL = 'pitwall:udp-diagnostics:request' as const

export interface PitwallApi {
  onTelemetry(listener: TelemetryListener): Unsubscribe
  onUdpDiagnostics(listener: UdpDiagnosticListener): Unsubscribe
}
