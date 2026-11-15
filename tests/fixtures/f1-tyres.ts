import { syntheticHeader } from './f1-header'

interface Options {
  format?: 2025 | 2026
  player?: number
  session?: bigint
  frame?: number
  overallFrame?: number
  time?: number
  actual?: number
  visual?: number
  age?: number
  // Ordem de transmissão EA: TE, TD, FE, FD.
  wear?: readonly [number, number, number, number]
}

// FIXTURES SINTÉTICAS completas; campos fora do escopo zerados.
// Construção independente: não importa layouts nem constantes do parser.
export function syntheticTyres(id: 7 | 10, options: Options = {}): Buffer {
  const { format = 2025, player = 3, session = 18446744073709551615n,
    frame = 100, overallFrame = 200, time = 10.5,
    actual = 18, visual = 16, age = 8, wear = [11.25, 22.5, 33.75, 44] } = options
  const cars = format === 2025 ? 22 : 24
  const stride = id === 7 ? (format === 2025 ? 55 : 59) : 46
  const packet = Buffer.alloc(29 + cars * stride)
  syntheticHeader(format, id).copy(packet)
  packet.writeBigUInt64LE(session, 7)
  packet.writeFloatLE(time, 15)
  packet.writeUInt32LE(frame, 19)
  packet.writeUInt32LE(overallFrame, 23)
  packet[27] = player
  for (let car = 0; car < cars; car++) {
    const base = 29 + car * stride
    if (id === 7) {
      packet[base + 25] = car === player ? actual : 20
      packet[base + 26] = car === player ? visual : 18
      packet[base + 27] = car === player ? age : 1
    } else {
      for (let wheel = 0; wheel < 4; wheel++) {
        packet.writeFloatLE(car === player ? wear[wheel]! : car + wheel, base + wheel * 4)
        packet[base + 16 + wheel] = 91 + wheel // Dano distinto do desgaste.
      }
    }
  }
  return packet
}
