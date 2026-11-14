import { describe, expect, it } from 'vitest'
import { inspectHeader } from '../src/main/udp/inspectHeader'
import { readUdpPort } from '../src/main/udp/config'
import { syntheticHeader } from './fixtures/f1-header'

describe('inspeção de cabeçalho com fixtures sintéticas EA', () => {
  it.each([2025, 2026])('identifica formato %i e todos os IDs documentados', (format) => {
    for (let packetId = 0; packetId <= (format === 2025 ? 15 : 16); packetId++) {
      expect(inspectHeader(syntheticHeader(format, packetId))).toEqual({
        kind: 'recognized', packetFormat: format, packetId, packetVersion: 1,
        sessionTime: 10.5, frameId: 100
      })
    }
  })

  it('rejeita todos os comprimentos abaixo do cabeçalho sem acessar fora do buffer', () => {
    for (let length = 0; length < 29; length++) {
      expect(inspectHeader(syntheticHeader().subarray(0, length)).kind).toBe('invalid')
    }
  })

  it.each([2024, 2027, 0, 65535])('reporta prefixo %i como não suportado sem atribuir packetId', (format) => {
    expect(inspectHeader(syntheticHeader(format))).toEqual({ kind: 'unsupported', packetFormat: format })
  })

  it('não usa o ano do jogo nem o payload para inferir o formato', () => {
    const header = syntheticHeader(2025)
    header[2] = 26
    expect(inspectHeader(Buffer.concat([header, Buffer.alloc(50, 255)])))
      .toMatchObject({ kind: 'recognized', packetFormat: 2025 })
  })

  it.each([[2025, 16], [2026, 17], [2025, 255]])('rejeita ID fora da tabela %i / %i', (format, id) => {
    expect(inspectHeader(syntheticHeader(format, id)).kind).toBe('invalid')
  })

  it('rejeita versão zero e tempo não finito; aceita valores finitos negativos', () => {
    const header = syntheticHeader()
    header[5] = 0
    expect(inspectHeader(header).kind).toBe('invalid')
    header[5] = 1
    for (const time of [NaN, Infinity, -Infinity]) {
      header.writeFloatLE(time, 15)
      expect(inspectHeader(header).kind).toBe('invalid')
    }
    header.writeFloatLE(-1, 15)
    expect(inspectHeader(header).kind).toBe('recognized')
  })
})

describe('configuração da porta UDP', () => {
  it('usa 20777 por padrão e aceita os limites configuráveis', () => {
    expect(readUdpPort(undefined)).toBe(20777)
    expect(readUdpPort('20778')).toBe(20778)
    expect(readUdpPort('1')).toBe(1)
    expect(readUdpPort('65535')).toBe(65535)
  })
  it.each(['', ' ', '0', '-1', '65536', '20777abc', '2.5', '2e4', 'Infinity', ' 20777'])
    ('rejeita configuração inválida: %j', (value) => {
      expect(readUdpPort(value)).toBeNull()
    })
})
