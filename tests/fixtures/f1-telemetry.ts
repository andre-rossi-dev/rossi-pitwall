import { syntheticHeader } from './f1-header'

// FIXTURES SINTÉTICAS completas, não capturas do jogo. Layouts independentes
// do parser, derivados dos anexos EA (docs/udp-protocol.md).
interface Options {
  format?: 2025 | 2026
  player?: number
  session?: bigint
  frame?: number
  overallFrame?: number
  time?: number
  speed?: number
  gear?: number
  lap?: number
  position?: number
  frontMS?: number
  frontMinutes?: number
  leaderMS?: number
  leaderMinutes?: number
  resultStatus?: number
}

export function syntheticTelemetry(id: 2 | 6, options: Options = {}): Buffer {
  const { format = 2025, player = 3, session = 18446744073709551615n,
    frame = 100, overallFrame = 200, time = 10.5, speed = 287, gear = 7, lap = 12,
    position = 5, frontMS = 1234, frontMinutes = 0, leaderMS = 2345,
    leaderMinutes = 1, resultStatus = 2 } = options
  const cars = format === 2025 ? 22 : 24
  const stride = id === 2 ? 57 : format === 2025 ? 60 : 59
  const packet = Buffer.alloc(29 + cars * stride + (id === 2 ? 2 : 3))
  syntheticHeader(format, id).copy(packet)
  packet.writeBigUInt64LE(session, 7)
  packet.writeFloatLE(time, 15)
  packet.writeUInt32LE(frame, 19)
  packet.writeUInt32LE(overallFrame, 23)
  packet[27] = player
  for (let car = 0; car < cars; car++) {
    const base = 29 + car * stride
    if (id === 6) {
      packet.writeUInt16LE(car === player ? speed : 40 + car, base)
      packet.writeInt8(car === player ? gear : 1, base + 15)
    } else {
      packet.writeUInt16LE(car === player ? frontMS : 321, base + 14)
      packet[base + 16] = car === player ? frontMinutes : 2
      packet.writeUInt16LE(car === player ? leaderMS : 654, base + 17)
      packet[base + 19] = car === player ? leaderMinutes : 3
      packet[base + 32] = car === player ? position : car + 1 // carPosition
      packet[base + 33] = car === player ? lap : 2
      packet[base + 43] = car + 1 // gridPosition
      packet[base + 44] = 4 // driverStatus: on track
      packet[base + 45] = car === player ? resultStatus : 1 // active / inactive
      packet[base + 56] = 255 // speedTrapFastestLap: not set
    }
  }
  packet[packet.length - (id === 2 ? 2 : 3)] = 255
  packet[packet.length - (id === 2 ? 1 : 2)] = 255
  return packet
}
