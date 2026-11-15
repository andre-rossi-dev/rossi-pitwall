import { syntheticHeader } from './f1-header'

// FIXTURE SINTÉTICA completa, não captura do jogo. Offsets independentes do
// decoder, derivados das estruturas packed EA 2025 e 2026.
interface Options {
  format?: 2025 | 2026
  player?: number
  session?: bigint
  frame?: number
  overallFrame?: number
  time?: number
  sessionType?: number
  trackId?: number
  seasonLink?: number
  weekendLink?: number
  sessionLink?: number
}

export function syntheticSession(options: Options = {}): Buffer {
  const { format = 2025, player = 3, session = 18446744073709551615n,
    frame = 100, overallFrame = 200, time = 10.5, sessionType = 1, trackId = 16,
    seasonLink = 0x12345678, weekendLink = 0x23456789, sessionLink = 0x3456789a } = options
  const packet = Buffer.alloc(format === 2025 ? 753 : 926)
  syntheticHeader(format, 1).copy(packet)
  packet.writeBigUInt64LE(session, 7)
  packet.writeFloatLE(time, 15)
  packet.writeUInt32LE(frame, 19)
  packet.writeUInt32LE(overallFrame, 23)
  packet[27] = player
  packet[35] = sessionType
  packet.writeInt8(trackId, 36)
  packet.writeUInt32LE(seasonLink, 670)
  packet.writeUInt32LE(weekendLink, 674)
  packet.writeUInt32LE(sessionLink, 678)
  // Arrays vazios e demais campos zerados são sintéticos, fora do escopo.
  return packet
}
