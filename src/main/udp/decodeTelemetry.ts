import type { RealLap, RealMotion, RealTelemetryIdentity } from '../../shared/realTelemetry'
import { HEADER_SIZE, inspectHeader } from './inspectHeader'

// Estruturas packed da EA; derivação completa em docs/udp-protocol.md.
const layouts = {
  2025: { cars: 22, motion: { size: 1352, stride: 60 }, lap: { size: 1285, stride: 57 } },
  2026: { cars: 24, motion: { size: 1448, stride: 59 }, lap: { size: 1399, stride: 57 } }
} as const

export type DecodedTelemetry = RealTelemetryIdentity & (
  | { readonly kind: 'motion'; readonly data: RealMotion }
  | { readonly kind: 'lap'; readonly data: RealLap }
)

export function decodeTelemetry(datagram: Buffer): DecodedTelemetry | null {
  const header = inspectHeader(datagram)
  if (header.kind !== 'recognized' || header.packetVersion !== 1) return null
  if (header.packetId !== 2 && header.packetId !== 6) return null

  const layout = layouts[header.packetFormat]
  const packetLayout = header.packetId === 6 ? layout.motion : layout.lap
  if (datagram.length !== packetLayout.size) return null
  const playerCarIndex = datagram.readUInt8(27)
  if (playerCarIndex >= layout.cars) return null

  const identity: RealTelemetryIdentity = {
    // BigInt preserva os 64 bits; a string decimal atravessa IPC sem perda.
    sessionId: datagram.readBigUInt64LE(7).toString(),
    packetFormat: header.packetFormat,
    playerCarIndex
  }
  const timing = { frameId: header.frameId, sessionTimeSeconds: header.sessionTime }
  const base = HEADER_SIZE + playerCarIndex * packetLayout.stride
  if (header.packetId === 6) {
    const gear = datagram.readInt8(base + 15)
    if (gear < -1 || gear > 8) return null
    return { ...identity, kind: 'motion', data: { ...timing, speedKph: datagram.readUInt16LE(base), gear } }
  }
  return { ...identity, kind: 'lap', data: { ...timing, number: datagram.readUInt8(base + 33) } }
}
