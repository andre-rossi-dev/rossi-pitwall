import type { TelemetryListener, Unsubscribe } from './telemetry'

export const TELEMETRY_CHANNEL = 'pitwall:telemetry' as const

export interface PitwallApi {
  onTelemetry(listener: TelemetryListener): Unsubscribe
}
