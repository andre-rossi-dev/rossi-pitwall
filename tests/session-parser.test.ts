import { describe, expect, it } from 'vitest'
import { decodeSession } from '../src/main/udp/decodeSession'
import { inspectHeader } from '../src/main/udp/inspectHeader'
import { syntheticSession } from './fixtures/f1-session'

describe.each([2025, 2026] as const)('Session Data %i (fixtures sintéticas)', (format) => {
  it('decodifica campos packed, LE e identidade uint64 sem confundir UID e vínculos', () => {
    expect(decodeSession(syntheticSession({ format }))).toEqual({
      kind: 'session', packetFormat: format, playerCarIndex: 3, sessionId: '18446744073709551615',
      data: {
        frameId: 100, overallFrameId: 200, sessionTimeSeconds: 10.5,
        sessionType: 1, trackId: 16, seasonLinkIdentifier: 0x12345678,
        weekendLinkIdentifier: 0x23456789, sessionLinkIdentifier: 0x3456789a
      }
    })
  })

  it('valida tamanho exato, todos os truncamentos e versão por formato', () => {
    const packet = syntheticSession({ format })
    expect(packet.length).toBe(format === 2025 ? 753 : 926)
    for (let size = 0; size < packet.length; size++) expect(decodeSession(packet.subarray(0, size))).toBeNull()
    expect(decodeSession(Buffer.concat([packet, Buffer.alloc(1)]))).toBeNull()
    for (const version of [0, 2, 255]) {
      packet[5] = version
      expect(decodeSession(packet)).toBeNull()
    }
    packet[5] = 1
    packet.writeUInt16LE(format === 2025 ? 2026 : 2025, 0)
    expect(decodeSession(packet)).toBeNull()
  })

  it('trata valores não documentados como desconhecidos e não promove zero a vínculo', () => {
    for (const sessionType of [0, 19, 255]) {
      for (const trackId of [-128, -1, 1, 8, 127]) {
        expect(decodeSession(syntheticSession({ format, sessionType, trackId, seasonLink: 0, weekendLink: 0, sessionLink: 0 }))?.data)
          .toMatchObject({ sessionType: null, trackId: null, seasonLinkIdentifier: null, weekendLinkIdentifier: null, sessionLinkIdentifier: null })
      }
    }
    expect(decodeSession(syntheticSession({ format, trackId: 0, seasonLink: 0xffffffff, sessionLink: 1 }))?.data)
      .toMatchObject({ trackId: 0, seasonLinkIdentifier: 0xffffffff, sessionLinkIdentifier: 1 })
    expect(decodeSession(syntheticSession({ format, trackId: 42 }))?.data.trackId).toBe(format === 2026 ? 42 : null)
  })

  it('reconhece os tipos de sessão documentados e preserva tempo negativo e contadores limite', () => {
    for (let sessionType = 1; sessionType <= 18; sessionType++) {
      expect(decodeSession(syntheticSession({ format, sessionType, time: -2, frame: 1, overallFrame: 0xffffffff }))?.data)
        .toMatchObject({ sessionType, sessionTimeSeconds: -2, frameId: 1, overallFrameId: 0xffffffff })
    }
    expect(decodeSession(syntheticSession({ format, overallFrame: 0 }))?.data.overallFrameId).toBe(0)
  })

  it('valida jogador, formato, ID e tempo finito sem modificar diagnóstico', () => {
    const cars = format === 2025 ? 22 : 24
    for (const player of [0, cars - 1]) expect(decodeSession(syntheticSession({ format, player }))?.playerCarIndex).toBe(player)
    for (const player of [cars, 254, 255]) expect(decodeSession(syntheticSession({ format, player }))).toBeNull()
    for (const time of [NaN, Infinity, -Infinity]) expect(decodeSession(syntheticSession({ format, time }))).toBeNull()
    const packet = syntheticSession({ format })
    packet[2] = 99
    expect(decodeSession(packet)?.packetFormat).toBe(format)
    for (const id of [0, 2, 6, 16, 255]) {
      packet[6] = id
      expect(decodeSession(packet)).toBeNull()
    }
    packet[6] = 1
    packet[5] = 2
    expect(inspectHeader(packet).kind).toBe('recognized')
    expect(decodeSession(packet)).toBeNull()
    packet.writeUInt16LE(2027, 0)
    expect(decodeSession(packet)).toBeNull()
  })
})
