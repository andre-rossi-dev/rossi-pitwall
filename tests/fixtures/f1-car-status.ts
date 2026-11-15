import { syntheticTyres } from './f1-tyres'

interface Options extends NonNullable<Parameters<typeof syntheticTyres>[1]> {
  fuel?: number
  capacity?: number
  remainingLaps?: number
  store?: number
  mode?: number
  mguk?: number
  mguh?: number
  deployed?: number
  limit?: number
}

// FIXTURE SINTÉTICA completa, independente de constantes e leituras do parser.
// Reutiliza só o construtor sintético de cabeçalho/pneus; valores diferem por carro.
export function syntheticCarStatus(options: Options = {}): Buffer {
  const { format = 2025, player = 3, fuel = 42.25, capacity = 110,
    remainingLaps = -1.25, store = 2_500_000, mode = 3, mguk = 1_250_000,
    mguh = 750_000, deployed = 3_125_000, limit = 8_500_000 } = options
  const packet = syntheticTyres(7, options)
  const cars = format === 2025 ? 22 : 24
  const stride = format === 2025 ? 55 : 59
  for (let car = 0; car < cars; car++) {
    const base = 29 + car * stride
    // Estrutura packed, escrita sequencial das regiões energéticas.
    let offset = base + 5
    for (const value of [fuel, capacity, remainingLaps]) {
      packet.writeFloatLE(car === player ? value : car + 0.5, offset)
      offset += 4
    }
    packet.writeFloatLE(650_000, base + 29) // Potências W, distintas das energias J.
    packet.writeFloatLE(120_000, base + 33)
    packet.writeFloatLE(car === player ? store : 1000 + car, base + 37)
    packet[base + 41] = car === player ? mode : 1
    offset = base + 42
    const energies = format === 2025 ? [mguk, mguh, deployed] : [mguk, mguh, limit, deployed]
    for (const value of energies) {
      packet.writeFloatLE(car === player ? value : 2000 + car, offset)
      offset += 4
    }
    packet[offset] = 1 // networkPaused, após a última energia; nunca parte do float.
  }
  return packet
}
