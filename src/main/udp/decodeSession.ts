import type { RealTelemetryIdentity } from '../../shared/realTelemetry'
import { SESSION_TYPES, TRACKS } from '../../shared/sessionContext'
import type { SessionContext, SessionType, TrackId } from '../../shared/sessionContext'
import { inspectHeader } from './inspectHeader'

// Conferidos separadamente nos anexos EA: os campos usados coincidem, mas
// o trailer 2026 é maior. Não aceitar o tamanho de um formato no outro.
const layouts = {
  2025: { size: 753, cars: 22, sessionType: 35, trackId: 36, season: 670, weekend: 674, session: 678 },
  2026: { size: 926, cars: 24, sessionType: 35, trackId: 36, season: 670, weekend: 674, session: 678 }
} as const

export type DecodedSession = RealTelemetryIdentity & {
  readonly kind: 'session'
  readonly data: SessionContext
}

export function decodeSession(datagram: Buffer): DecodedSession | null {
  const header = inspectHeader(datagram)
  if (header.kind !== 'recognized' || header.packetId !== 1 || header.packetVersion !== 1) return null
  const layout = layouts[header.packetFormat]
  if (datagram.length !== layout.size) return null
  const playerCarIndex = datagram.readUInt8(27)
  if (playerCarIndex >= layout.cars) return null

  const sessionType = datagram.readUInt8(layout.sessionType)
  const trackId = datagram.readInt8(layout.trackId)
  const link = (offset: number): number | null => {
    const value = datagram.readUInt32LE(offset)
    return value === 0 ? null : value
  }
  return {
    kind: 'session', packetFormat: header.packetFormat, playerCarIndex,
    sessionId: datagram.readBigUInt64LE(7).toString(),
    data: {
      frameId: header.frameId, overallFrameId: datagram.readUInt32LE(23),
      sessionTimeSeconds: header.sessionTime,
      sessionType: Object.hasOwn(SESSION_TYPES, sessionType) ? sessionType as SessionType : null,
      trackId: Object.hasOwn(TRACKS, trackId) && (trackId !== 42 || header.packetFormat === 2026)
        ? trackId as TrackId : null,
      seasonLinkIdentifier: link(layout.season), weekendLinkIdentifier: link(layout.weekend),
      sessionLinkIdentifier: link(layout.session)
    }
  }
}
