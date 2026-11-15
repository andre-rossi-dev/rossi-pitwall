import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RealTelemetrySource } from '../src/main/telemetry/RealTelemetrySource'
import { UdpReceiver } from '../src/main/udp/UdpReceiver'
import type { UdpDiagnosticListener, UdpStatus } from '../src/shared/udp'
import { syntheticTyres } from './fixtures/f1-tyres'
import { syntheticTelemetry } from './fixtures/f1-telemetry'
import { syntheticSession } from './fixtures/f1-session'

describe.each([2025, 2026] as const)('ciclo dos pneus %i — dados sintéticos', (format) => {
  let source: RealTelemetrySource
  let packets: Set<(packet: Buffer) => void>
  let diagnostics: Set<UdpDiagnosticListener>
  const send = (packet: Buffer) => packets.forEach((callback) => callback(packet))
  const tyres = (id: 7 | 10, options: Parameters<typeof syntheticTyres>[1] = {}) =>
    send(syntheticTyres(id, { format, ...options }))
  const status = (value: UdpStatus) => diagnostics.forEach((callback) => callback({
    ...new UdpReceiver().getSnapshot(), status: value
  }))

  beforeEach(() => {
    vi.useFakeTimers()
    packets = new Set()
    diagnostics = new Set()
    source = new RealTelemetrySource({
      subscribeDatagrams(callback) {
        packets.add(callback)
        return () => { packets.delete(callback) }
      },
      subscribe(callback) {
        diagnostics.add(callback)
        return () => { diagnostics.delete(callback) }
      }
    })
    source.start()
  })
  afterEach(() => { source.stop(); vi.useRealTimers() })

  it.each([7, 10] as const)('ordena ID %i independentemente: duplicação, atraso, meia faixa e wraparound', (id) => {
    const key = id === 7 ? 'tyreStatus' : 'tyreWear'
    tyres(id, { overallFrame: 0xfffffffe })
    const first = source.getSnapshot()[key]
    vi.advanceTimersByTime(2000)
    for (const overallFrame of [0xfffffffe, 0xfffffffd, 0x7ffffffe]) {
      tyres(id, { overallFrame, age: 0, wear: [0, 0, 0, 0] })
      expect(source.getSnapshot()[key]).toEqual(first)
    }
    vi.advanceTimersByTime(1000)
    expect(source.getSnapshot()[key]).toBeNull()
    tyres(id, { overallFrame: 1, age: 0, wear: [0, 0, 0, 0] })
    expect(source.getSnapshot()[key]?.overallFrameId).toBe(1)
    expect(Object.isFrozen(source.getSnapshot()[key])).toBe(true)
  })

  it.each([7, 10] as const)('publica expiração independente começando pelo ID %i', (first) => {
    const second = first === 7 ? 10 : 7
    const firstKey = first === 7 ? 'tyreStatus' : 'tyreWear'
    const secondKey = first === 7 ? 'tyreWear' : 'tyreStatus'
    const listener = vi.fn()
    source.subscribe(listener)
    tyres(first, { overallFrame: 900 })
    vi.advanceTimersByTime(1000)
    tyres(second, { overallFrame: 1 })
    vi.advanceTimersByTime(1999)
    expect(source.getSnapshot()[firstKey]).not.toBeNull()
    vi.advanceTimersByTime(1)
    expect(listener.mock.lastCall?.[0][firstKey]).toBeNull()
    expect(listener.mock.lastCall?.[0][secondKey]).not.toBeNull()
    expect(source.getSnapshot()[`${firstKey}Freshness`]).toBe('stale')
    vi.advanceTimersByTime(1000)
    expect(source.getSnapshot()[secondKey]).toBeNull()
    tyres(first, { overallFrame: 901 })
    expect(source.getSnapshot()[firstKey]).not.toBeNull()
    expect(source.getSnapshot()[secondKey]).toBeNull()
  })

  it('preserva flashback e troca de pneus com reduções de idade/desgaste', () => {
    tyres(7)
    tyres(10)
    tyres(7, { overallFrame: 201, frame: 2, time: 1, age: 2 })
    tyres(10, { overallFrame: 700, frame: 3, time: 1.5, wear: [2, 3, 4, 5] })
    expect(source.getSnapshot()).toMatchObject({
      tyreStatus: { ageLaps: 2, frameId: 2 }, tyreWear: { rearLeft: 2, frontRight: 5 }
    })
    tyres(7, { overallFrame: 202, age: 0, actual: 20, visual: 18 })
    tyres(10, { overallFrame: 701, wear: [0, 0, 0, 0] })
    expect(source.getSnapshot()).toMatchObject({
      tyreStatus: { ageLaps: 0, actualCompound: 20, visualCompound: 18 },
      tyreWear: { rearLeft: 0, rearRight: 0, frontLeft: 0, frontRight: 0 }
    })
  })

  it.each([7, 10] as const)('ID %i confirma identidade sem misturar grupos, e rejeita UID aposentado', (id) => {
    tyres(7)
    tyres(10)
    send(syntheticTelemetry(6, { format }))
    send(syntheticTelemetry(2, { format }))
    send(syntheticSession({ format }))
    const before = source.getSnapshot()
    tyres(id, { session: 50n, overallFrame: 0 })
    tyres(id, { session: 50n, overallFrame: 0 })
    expect(source.getSnapshot()).toEqual(before)
    tyres(id, { session: 50n, overallFrame: 1 })
    expect(source.getSnapshot()).toMatchObject({
      identity: { sessionId: '50' }, identityRevision: 1, motion: null, lap: null, context: null,
      [id === 7 ? 'tyreWear' : 'tyreStatus']: null
    })
    const confirmed = source.getSnapshot()
    for (const overallFrame of [201, 202]) { tyres(7, { overallFrame }); tyres(10, { overallFrame }) }
    expect(source.getSnapshot()).toEqual(confirmed)
  })

  it.each([{ player: 4 }, { format: format === 2025 ? 2026 as const : 2025 as const }])('limpa pneus ao confirmar transição por métrica: %o', (change) => {
    tyres(7)
    tyres(10)
    send(syntheticTelemetry(6, { format, ...change, overallFrame: 0 }))
    expect(source.getSnapshot().tyreStatus).not.toBeNull()
    send(syntheticTelemetry(6, { format, ...change, overallFrame: 1 }))
    expect(source.getSnapshot()).toMatchObject({ tyreStatus: null, tyreWear: null, motion: { speedKph: 287 } })
  })

  it('não confirma grupos diferentes nem candidata expirada; aceita a próxima sequência coerente', () => {
    tyres(7)
    tyres(7, { session: 50n, overallFrame: 0 })
    tyres(10, { session: 50n, overallFrame: 100 })
    expect(source.getSnapshot().identityRevision).toBe(0)
    vi.advanceTimersByTime(1000)
    tyres(7, { session: 50n, overallFrame: 1 })
    expect(source.getSnapshot().identityRevision).toBe(0)
    tyres(7, { session: 50n, overallFrame: 2 })
    expect(source.getSnapshot()).toMatchObject({ identityRevision: 1, tyreWear: null })
  })

  it('pausa com contador repetido e silêncio não limpam identidade; retomada exige avanço', () => {
    tyres(7)
    tyres(10)
    const identity = source.getSnapshot().identity
    for (let second = 0; second < 4; second++) {
      vi.advanceTimersByTime(1000)
      tyres(7)
      tyres(10)
    }
    status('idle')
    vi.advanceTimersByTime(60000)
    expect(source.getSnapshot()).toMatchObject({ identity, tyreStatus: null, tyreWear: null })
    tyres(10)
    expect(source.getSnapshot().tyreWear).toBeNull()
    tyres(10, { overallFrame: 201 })
    expect(source.getSnapshot().tyreWear).not.toBeNull()
    expect(source.getSnapshot().tyreStatus).toBeNull()
  })

  it('contexto ausente ou contraditório não bloqueia pneus nem métricas anteriores', () => {
    tyres(7)
    tyres(10)
    expect(source.getSnapshot().context).toBeNull()
    send(syntheticTelemetry(6, { format }))
    send(syntheticTelemetry(2, { format }))
    send(syntheticSession({ format }))
    send(syntheticSession({ format, overallFrame: 201, sessionLink: 999 }))
    expect(source.getSnapshot()).toMatchObject({ contextStatus: 'unavailable', context: null })
    tyres(7, { overallFrame: 201, age: 0 })
    tyres(10, { overallFrame: 201, wear: [0, 1, 2, 3] })
    expect(source.getSnapshot()).toMatchObject({
      motion: { speedKph: 287, gear: 7 }, lap: { number: 12 },
      tyreStatus: { ageLaps: 0 }, tyreWear: { rearLeft: 0 }
    })
    vi.advanceTimersByTime(3000)
    send(syntheticTelemetry(6, { format, overallFrame: 201 }))
    send(syntheticTelemetry(2, { format, overallFrame: 201 }))
    expect(source.getSnapshot()).toMatchObject({ status: 'receiving', tyreStatus: null, tyreWear: null })
  })

  it('payload inválido não renova frescor nem cria candidata', () => {
    tyres(7)
    tyres(10)
    vi.advanceTimersByTime(2000)
    for (const overallFrame of [201, 202]) {
      tyres(10, { overallFrame, wear: [NaN, 0, 0, 0] })
      tyres(10, { session: 50n, overallFrame, wear: [101, 0, 0, 0] })
      send(syntheticTyres(7, { format, overallFrame }).subarray(0, 60))
    }
    vi.advanceTimersByTime(1000)
    expect(source.getSnapshot()).toMatchObject({ identityRevision: 0, tyreStatus: null, tyreWear: null })
  })

  it.each(['starting', 'stopped', 'error'] as const)('limpa os dois grupos em %s', (value) => {
    tyres(7)
    tyres(10)
    status(value)
    expect(source.getSnapshot()).toMatchObject({ identity: null, tyreStatus: null, tyreWear: null, tyreStatusFreshness: 'waiting', tyreWearFreshness: 'waiting' })
  })

  it('cancela inscrições individualmente e libera timer e listeners ao parar', () => {
    const listener = vi.fn()
    const cancelFirst = source.subscribe(listener)
    const cancelSecond = source.subscribe(listener)
    source.start()
    expect(packets.size).toBe(1)
    expect(diagnostics.size).toBe(1)
    expect(vi.getTimerCount()).toBe(1)
    cancelFirst()
    cancelFirst()
    listener.mockClear()
    tyres(7)
    tyres(10)
    vi.advanceTimersByTime(100)
    expect(listener).toHaveBeenCalledTimes(1)
    cancelSecond()
    listener.mockClear()
    source.stop()
    source.stop()
    expect(packets.size).toBe(0)
    expect(diagnostics.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    expect(source.getSnapshot()).toMatchObject({ tyreStatus: null, tyreWear: null })
    vi.advanceTimersByTime(10000)
    expect(listener).not.toHaveBeenCalled()
    source.start()
    tyres(7, { overallFrame: 0 })
    expect(source.getSnapshot().tyreStatus?.overallFrameId).toBe(0)
  })
})
