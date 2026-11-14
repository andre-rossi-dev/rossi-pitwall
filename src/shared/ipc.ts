import type { TelemetryListener, Unsubscribe } from './telemetry'
import type { UdpDiagnosticListener } from './udp'
import type { RealTelemetryListener } from './realTelemetry'

export const TELEMETRY_CHANNEL = 'pitwall:telemetry' as const
export const UDP_DIAGNOSTICS_CHANNEL = 'pitwall:udp-diagnostics' as const
export const UDP_DIAGNOSTICS_REQUEST_CHANNEL = 'pitwall:udp-diagnostics:request' as const
export const REAL_TELEMETRY_CHANNEL = 'pitwall:real-telemetry' as const
export const REAL_TELEMETRY_REQUEST_CHANNEL = 'pitwall:real-telemetry:request' as const

export interface PitwallApi {
  onTelemetry(listener: TelemetryListener): Unsubscribe
  onUdpDiagnostics(listener: UdpDiagnosticListener): Unsubscribe
  onRealTelemetry(listener: RealTelemetryListener): Unsubscribe
}
