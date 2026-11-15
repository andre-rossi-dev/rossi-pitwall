import { describe, expect, it } from 'vitest'
import { decodeTelemetry } from '../src/main/udp/decodeTelemetry'
import { inspectHeader } from '../src/main/udp/inspectHeader'
import { syntheticTelemetry } from './fixtures/f1-telemetry'

describe.each([2025, 2026] as const)('decodificação UDP %i com fixtures sintéticas completas', (format) => {
  const cars = format === 2025 ? 22 : 24
  it.each([0, 3, cars - 1])('seleciona o carro %i e preserva uint64 máximo', (player) => {
    expect(decodeTelemetry(syntheticTelemetry(6, { format, player }))).toEqual({
      kind: 'motion', packetFormat: format, playerCarIndex: player, sessionId: '18446744073709551615',
      data: { speedKph: 287, gear: 7, frameId: 100, overallFrameId: 200, sessionTimeSeconds: 10.5 }
    })
    expect(decodeTelemetry(syntheticTelemetry(2, { format, player }))).toMatchObject({
      kind: 'lap', playerCarIndex: player, data: { number: 12 }
    })
  })

  it.each([-1, 0, 1, 2, 3, 4, 5, 6, 7, 8])('decodifica a marcha %i com sinal', (gear) => {
    expect(decodeTelemetry(syntheticTelemetry(6, { format, gear }))).toMatchObject({ data: { gear } })
  })

  it.each([2, 6] as const)('lê os contadores uint32 independentes e seus limites no ID %i', (id) => {
    for (const overallFrame of [0, 0x7fffffff, 0x80000000, 0xffffffff]) {
      expect(decodeTelemetry(syntheticTelemetry(id, { format, frame: 7, overallFrame, time: -1 })))
        .toMatchObject({ data: { frameId: 7, overallFrameId: overallFrame, sessionTimeSeconds: -1 } })
    }
  })

  it.each([2, 6] as const)('rejeita todos os truncamentos, bytes extras e versão incompatível do ID %i', (id) => {
    const packet = syntheticTelemetry(id, { format })
    expect(packet.length).toBe(id === 2 ? format === 2025 ? 1285 : 1399 : format === 2025 ? 1352 : 1448)
    for (let length = 0; length < packet.length; length++) {
      expect(decodeTelemetry(packet.subarray(0, length))).toBeNull()
    }
    expect(decodeTelemetry(Buffer.concat([packet, Buffer.alloc(1)]))).toBeNull()
    for (const version of [0, 2, 255]) {
      packet[5] = version
      expect(decodeTelemetry(packet)).toBeNull()
    }
    packet[5] = 1
    packet.writeUInt16LE(format === 2025 ? 2026 : 2025, 0)
    expect(decodeTelemetry(packet)).toBeNull()
  })

  it.each([2, 6] as const)('rejeita índices inválidos do ID %i', (id) => {
    for (const player of [cars, 254, 255]) {
      expect(decodeTelemetry(syntheticTelemetry(id, { format, player }))).toBeNull()
    }
  })

  it('não inventa limites de velocidade/volta e não usa gameYear como formato', () => {
    const packet = syntheticTelemetry(6, { format, speed: 65535, gear: 0 })
    packet[2] = 99
    expect(decodeTelemetry(packet)).toMatchObject({ packetFormat: format, data: { speedKph: 65535, gear: 0 } })
    expect(decodeTelemetry(syntheticTelemetry(2, { format, lap: 0 }))).toMatchObject({ data: { number: 0 } })
  })

  it('rejeita marcha fora da especificação sem alterar a política do diagnóstico', () => {
    for (const gear of [-128, -2, 9, 127]) {
      const packet = syntheticTelemetry(6, { format, gear })
      expect(decodeTelemetry(packet)).toBeNull()
      expect(inspectHeader(packet).kind).toBe('recognized')
    }
  })

  it('ignora formatos e IDs desconhecidos e tempo não finito', () => {
    const packet = syntheticTelemetry(6, { format })
    packet.writeUInt16LE(2027, 0)
    expect(decodeTelemetry(packet)).toBeNull()
    packet.writeUInt16LE(format, 0)
    for (const id of [0, 1, 3, 16, 255]) {
      packet[6] = id
      expect(decodeTelemetry(packet)).toBeNull()
    }
    packet[6] = 6
    for (const time of [NaN, Infinity, -Infinity]) {
      packet.writeFloatLE(time, 15)
      expect(decodeTelemetry(packet)).toBeNull()
    }
  })
})
