import { describe, expect, it } from 'vitest'
import { decodeTyres } from '../src/main/udp/decodeTyres'
import { tyreCompoundLabel } from '../src/shared/tyres'
import { syntheticTyres } from './fixtures/f1-tyres'

describe.each([2025, 2026] as const)('pneus UDP %i — fixtures sintéticas', (format) => {
  const cars = format === 2025 ? 22 : 24
  it.each([0, 3, cars - 1])('seleciona somente o carro %i nos dois pacotes', (player) => {
    const status = syntheticTyres(7, { format, player, age: 0 })
    const wear = syntheticTyres(10, { format, player })
    expect(status.length).toBe(format === 2025 ? 1239 : 1445)
    expect(wear.length).toBe(format === 2025 ? 1041 : 1133)
    expect(decodeTyres(status)).toEqual({
      kind: 'tyreStatus', packetFormat: format, playerCarIndex: player,
      sessionId: '18446744073709551615', data: {
        frameId: 100, overallFrameId: 200, sessionTimeSeconds: 10.5,
        actualCompound: 18, visualCompound: 16, ageLaps: 0
      },
      fuel: { inTank: 0, capacity: 0, remainingLaps: 0 },
      ers: {
        storeEnergyJ: 0, deployMode: 0, harvestedThisLapMGUKJ: 0,
        harvestedThisLapMGUHJ: 0, deployedThisLapJ: 0,
        harvestLimitPerLapJ: format === 2026 ? 0 : null
      }
    })
    expect(decodeTyres(wear)).toMatchObject({
      kind: 'tyreWear', packetFormat: format, playerCarIndex: player,
      data: { rearLeft: 11.25, rearRight: 22.5, frontLeft: 33.75, frontRight: 44 }
    })
  })
  it('preserva códigos desconhecidos, idade uint8 e limites do desgaste', () => {
    expect(decodeTyres(syntheticTyres(7, { format, actual: 255, visual: 0, age: 255 }))?.data)
      .toMatchObject({ actualCompound: 255, visualCompound: 0, ageLaps: 255 })
    expect(decodeTyres(syntheticTyres(10, { format, wear: [0, 100, 0.125, 99.5] }))?.data)
      .toMatchObject({ rearLeft: 0, rearRight: 100, frontLeft: 0.125, frontRight: 99.5 })
  })
  it.each([NaN, Infinity, -Infinity, -0.01, 100.01])('rejeita desgaste inválido %s em qualquer roda', (value) => {
    for (let wheel = 0; wheel < 4; wheel++) {
      const wear: [number, number, number, number] = [1, 2, 3, 4]
      wear[wheel] = value
      expect(decodeTyres(syntheticTyres(10, { format, wear }))).toBeNull()
    }
  })
  it.each([7, 10] as const)('rejeita truncamentos, excessos, índices e versões do ID %i', (id) => {
    const packet = syntheticTyres(id, { format })
    for (let length = 0; length < packet.length; length++) {
      expect(decodeTyres(packet.subarray(0, length))).toBeNull()
    }
    expect(decodeTyres(Buffer.concat([packet, Buffer.alloc(1)]))).toBeNull()
    for (const player of [cars, 255]) {
      const invalid = Buffer.from(packet)
      invalid[27] = player
      expect(decodeTyres(invalid)).toBeNull()
    }
    for (const version of [0, 2, 255]) {
      const invalid = Buffer.from(packet)
      invalid[5] = version
      expect(decodeTyres(invalid)).toBeNull()
    }
    for (const wrongFormat of [2024, format === 2025 ? 2026 : 2025]) {
      const invalid = Buffer.from(packet)
      invalid.writeUInt16LE(wrongFormat, 0)
      expect(decodeTyres(invalid)).toBeNull()
    }
    packet[6] = 6
    expect(decodeTyres(packet)).toBeNull()
  })
  it('usa packetFormat, preserva retrocessos e rejeita tempo não finito', () => {
    const packet = syntheticTyres(7, { format, time: -1, frame: 0, overallFrame: 4294967295 })
    packet[2] = 99
    expect(decodeTyres(packet)?.data).toMatchObject({ sessionTimeSeconds: -1, frameId: 0, overallFrameId: 4294967295 })
    packet.writeFloatLE(NaN, 15)
    expect(decodeTyres(packet)).toBeNull()
  })
})

it('distingue rótulos físicos e visuais sem inferir a seleção do fim de semana', () => {
  for (const [code, label] of [[16, 'C5'], [17, 'C4'], [18, 'C3'], [19, 'C2'], [20, 'C1'], [21, 'C0'], [22, 'C6'], [7, 'Intermediário'], [8, 'Chuva']] as const) {
    expect(tyreCompoundLabel(code, 'actual')).toBe(label)
  }
  for (const [code, label] of [[16, 'Macio'], [17, 'Médio'], [18, 'Duro'], [7, 'Intermediário'], [8, 'Chuva']] as const) {
    expect(tyreCompoundLabel(code, 'visual')).toBe(label)
  }
  for (const code of [0, 9, 11, 255]) {
    expect(tyreCompoundLabel(code, 'actual')).toBe(`Desconhecido (${code})`)
    expect(tyreCompoundLabel(code, 'visual')).toBe(`Desconhecido (${code})`)
  }
  expect(tyreCompoundLabel(22, 'visual')).toBe('Desconhecido (22)')
})
