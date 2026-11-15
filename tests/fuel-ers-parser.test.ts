import { describe, expect, it } from 'vitest'
import { decodeTyres } from '../src/main/udp/decodeTyres'
import { ersDeployModeLabel } from '../src/shared/ers'
import { syntheticCarStatus } from './fixtures/f1-car-status'

function decode(packet: Buffer) {
  const result = decodeTyres(packet)
  expect(result?.kind).toBe('tyreStatus')
  if (result?.kind !== 'tyreStatus') throw new Error('ID 7 sintético rejeitado')
  return result
}

describe.each([2025, 2026] as const)('combustível/ERS %i — fixtures sintéticas', (format) => {
  const cars = format === 2025 ? 22 : 24
  it.each([0, 3, cars - 1])('lê o ID 7 completo do jogador %i, coexistindo com pneus', (player) => {
    const packet = syntheticCarStatus({ format, player })
    expect(packet.length).toBe(format === 2025 ? 1239 : 1445)
    const result = decode(packet)
    expect(result).toEqual({
      kind: 'tyreStatus', packetFormat: format, playerCarIndex: player,
      sessionId: '18446744073709551615',
      data: { frameId: 100, overallFrameId: 200, sessionTimeSeconds: 10.5,
        actualCompound: 18, visualCompound: 16, ageLaps: 8 },
      fuel: { inTank: 42.25, capacity: 110, remainingLaps: -1.25 },
      ers: { storeEnergyJ: 2_500_000, deployMode: 3,
        harvestedThisLapMGUKJ: 1_250_000, harvestedThisLapMGUHJ: 750_000,
        deployedThisLapJ: 3_125_000, harvestLimitPerLapJ: format === 2026 ? 8_500_000 : null }
    })
    // playerCarIndex, e não jogador secundário nem gameYear, decide a leitura.
    packet[28] = player === 0 ? 1 : 0
    packet[2] = 99
    expect(decode(packet)).toEqual(result)
  })

  it.each([0, 0.125, 1_000_000, 3.4028234663852886e38])('preserva massa/energia válida %s sem teto físico presumido', (value) => {
    const result = decode(syntheticCarStatus({ format, fuel: value, capacity: value,
      store: value, mguk: value, mguh: value, deployed: value, limit: value }))
    expect(result.fuel).toMatchObject({ inTank: value, capacity: value })
    expect(result.ers).toMatchObject({ storeEnergyJ: value, harvestedThisLapMGUKJ: value,
      harvestedThisLapMGUHJ: value, deployedThisLapJ: value,
      harvestLimitPerLapJ: format === 2026 ? value : null })
  })

  it.each([-100, -0.25, 0, 0.125, 100])('preserva estimativa MFD com sinal: %s', (remainingLaps) => {
    expect(decode(syntheticCarStatus({ format, remainingLaps })).fuel.remainingLaps).toBe(remainingLaps)
  })

  it('não arredonda os floats nem invalida medições pela relação com a capacidade', () => {
    const result = decode(syntheticCarStatus({ format, fuel: 120.12345, capacity: 100, store: 1234.5678 }))
    expect(result.fuel.inTank).toBe(Math.fround(120.12345))
    expect(result.ers.storeEnergyJ).toBe(Math.fround(1234.5678))
  })

  it.each([NaN, Infinity, -Infinity, -0.125])('marca apenas o campo inválido %s, sem descartar pneus', (value) => {
    const fields = [
      [5, 'fuel', 'inTank'], [9, 'fuel', 'capacity'],
      [37, 'ers', 'storeEnergyJ'], [42, 'ers', 'harvestedThisLapMGUKJ'],
      [46, 'ers', 'harvestedThisLapMGUHJ'],
      [format === 2026 ? 54 : 50, 'ers', 'deployedThisLapJ'],
      ...(format === 2026 ? [[50, 'ers', 'harvestLimitPerLapJ']] as const : [])
    ] as const
    for (const [offset, domain, field] of fields) {
      const packet = syntheticCarStatus({ format })
      const expected = decode(packet)
      packet.writeFloatLE(value, 29 + 3 * (format === 2025 ? 55 : 59) + offset)
      expect(decode(packet)).toEqual({ ...expected,
        [domain]: { ...expected[domain], [field]: null } })
    }
  })

  it.each([NaN, Infinity, -Infinity])('torna estimativa MFD não finita %s indisponível', (remainingLaps) => {
    expect(decode(syntheticCarStatus({ format, remainingLaps })).fuel)
      .toEqual({ inTank: 42.25, capacity: 110, remainingLaps: null })
  })

  it.each([0, 1, 2, 3, 4, 255])('preserva e identifica modo %i conforme o protocolo', (mode) => {
    expect(decode(syntheticCarStatus({ format, mode })).ers.deployMode).toBe(mode)
    const label = ['Nenhum', 'Médio', 'Hotlap', format === 2025 ? 'Overtake' : 'Boost'][mode]
    expect(ersDeployModeLabel(format, mode)).toBe(label ?? `Indisponível (${mode})`)
  })

  it('rejeita todas as truncagens, excesso, versões, índices e formatos incompatíveis', () => {
    const packet = syntheticCarStatus({ format })
    for (let size = 0; size < packet.length; size++) expect(decodeTyres(packet.subarray(0, size))).toBeNull()
    expect(decodeTyres(Buffer.concat([packet, Buffer.alloc(1)]))).toBeNull()
    for (const [offset, value] of [[5, 0], [5, 2], [5, 255], [27, cars], [27, 255], [6, 16]]) {
      const invalid = Buffer.from(packet)
      invalid[offset!] = value!
      expect(decodeTyres(invalid)).toBeNull()
    }
    for (const wrongFormat of [2024, format === 2025 ? 2026 : 2025]) {
      const invalid = Buffer.from(packet)
      invalid.writeUInt16LE(wrongFormat, 0)
      expect(decodeTyres(invalid)).toBeNull()
    }
  })
})
