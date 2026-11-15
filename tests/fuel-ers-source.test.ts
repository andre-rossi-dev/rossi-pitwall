import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RealTelemetrySource } from '../src/main/telemetry/RealTelemetrySource'
import { UdpReceiver } from '../src/main/udp/UdpReceiver'
import type { UdpDiagnosticListener, UdpStatus } from '../src/shared/udp'
import { syntheticCarStatus } from './fixtures/f1-car-status'
import { syntheticTyres } from './fixtures/f1-tyres'
import { syntheticTelemetry } from './fixtures/f1-telemetry'
import { syntheticSession } from './fixtures/f1-session'

describe.each([2025, 2026] as const)('integridade combustível/ERS %i — dados sintéticos', (format) => {
  let source: RealTelemetrySource
  let packets: Set<(packet: Buffer) => void>
  let diagnostics: Set<UdpDiagnosticListener>
  const send = (packet: Buffer) => packets.forEach((callback) => callback(packet))
  const carStatus = (options: Parameters<typeof syntheticCarStatus>[0] = {}) =>
    send(syntheticCarStatus({ format, ...options }))
  const receiverStatus = (status: UdpStatus) => diagnostics.forEach((callback) => callback({
    ...new UdpReceiver().getSnapshot(), status
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

  it('atualiza e publica todo o ID 7 atomicamente, sem arredondar nem repetir valores inválidos', () => {
    const listener = vi.fn()
    source.subscribe(listener)
    expect(source.getSnapshot()).toMatchObject({ fuel: null, ers: null, tyreStatus: null })
    carStatus()
    vi.advanceTimersByTime(100)
    const first = source.getSnapshot()
    expect(Object.isFrozen(first.fuel)).toBe(true)
    expect(Object.isFrozen(first.ers)).toBe(true)
    carStatus({ overallFrame: 201, fuel: NaN, store: Infinity, mode: 255, age: 0,
      remainingLaps: -0.12345, mguh: 0 })
    listener.mockClear()
    vi.advanceTimersByTime(100)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.lastCall?.[0]).toMatchObject({
      tyreStatusFreshness: 'fresh', tyreStatus: { overallFrameId: 201, ageLaps: 0 },
      fuel: { inTank: null, capacity: 110, remainingLaps: Math.fround(-0.12345) },
      ers: { storeEnergyJ: null, deployMode: 255, harvestedThisLapMGUHJ: 0, deployedThisLapJ: 3_125_000 }
    })
    expect(first.fuel?.inTank).toBe(42.25)
  })

  it('rejeita duplicações, atrasos e meia faixa sem renovar frescor; aceita wraparound', () => {
    carStatus({ overallFrame: 0xfffffffe })
    const first = source.getSnapshot()
    vi.advanceTimersByTime(2000)
    for (const overallFrame of [0xfffffffe, 0xfffffffd, 0x7ffffffe]) {
      carStatus({ overallFrame, fuel: 0, store: 0, age: 0 })
      expect(source.getSnapshot()).toEqual(first)
    }
    vi.advanceTimersByTime(1000)
    expect(source.getSnapshot()).toMatchObject({ fuel: null, ers: null, tyreStatus: null, tyreStatusFreshness: 'stale' })
    carStatus({ overallFrame: 1, fuel: 0, store: 0, age: 0 })
    expect(source.getSnapshot()).toMatchObject({
      tyreStatus: { overallFrameId: 1, ageLaps: 0 }, fuel: { inTank: 0 }, ers: { storeEnergyJ: 0 }
    })
  })

  it('aceita flashback e reinício de contadores por volta, preservando métricas/contexto', () => {
    carStatus()
    send(syntheticTelemetry(6, { format }))
    send(syntheticTelemetry(2, { format }))
    send(syntheticSession({ format }))
    send(syntheticTyres(10, { format }))
    const before = source.getSnapshot()
    carStatus({ overallFrame: 201, frame: 1, time: 0.5, fuel: 50, store: 500_000,
      mguk: 0, mguh: 0, deployed: 0, limit: 0, age: 0 })
    expect(source.getSnapshot()).toMatchObject({
      tyreStatus: { frameId: 1, sessionTimeSeconds: 0.5, ageLaps: 0 },
      fuel: { inTank: 50 }, ers: { storeEnergyJ: 500_000, harvestedThisLapMGUKJ: 0,
        harvestedThisLapMGUHJ: 0, deployedThisLapJ: 0 },
      motion: before.motion, lap: before.lap, context: before.context, tyreWear: before.tyreWear
    })
    carStatus({ overallFrame: 202, frame: 2, time: 1, fuel: 49, mguk: 0, mguh: 0, deployed: 0 })
    expect(source.getSnapshot().ers?.deployedThisLapJ).toBe(0)
  })

  it('expira todo ID 7 em 3000 ms sem ser renovado por outros IDs; retoma após silêncio', () => {
    const listener = vi.fn()
    source.subscribe(listener)
    carStatus()
    const identity = source.getSnapshot().identity
    vi.advanceTimersByTime(2000)
    send(syntheticTyres(10, { format, overallFrame: 1 }))
    send(syntheticTelemetry(6, { format, overallFrame: 900 }))
    send(syntheticTelemetry(2, { format, overallFrame: 20 }))
    send(syntheticSession({ format, overallFrame: 0 }))
    vi.advanceTimersByTime(999)
    expect(source.getSnapshot().fuel).not.toBeNull()
    vi.advanceTimersByTime(1)
    expect(listener.mock.lastCall?.[0]).toMatchObject({
      fuel: null, ers: null, tyreStatus: null, tyreStatusFreshness: 'stale',
      tyreWear: { overallFrameId: 1 }, motion: { speedKph: 287 }, lap: { number: 12 },
      contextStatus: 'identified'
    })
    receiverStatus('idle')
    vi.advanceTimersByTime(60000)
    carStatus() // Repetição após silêncio não recupera dados.
    expect(source.getSnapshot()).toMatchObject({ identity, fuel: null, ers: null })
    carStatus({ overallFrame: 201 })
    expect(source.getSnapshot()).toMatchObject({ identity, fuel: { inTank: 42.25 }, ers: { storeEnergyJ: 2_500_000 } })
  })

  it.each([
    { session: 50n }, { player: 4 }, { format: format === 2025 ? 2026 as const : 2025 as const }
  ])('confirma identidade pelo ID 7 sem misturar seus domínios: %o', (change) => {
    carStatus()
    send(syntheticTelemetry(6, { format }))
    send(syntheticTelemetry(2, { format }))
    send(syntheticSession({ format }))
    send(syntheticTyres(10, { format }))
    const before = source.getSnapshot()
    carStatus({ ...change, overallFrame: 0, fuel: 10, store: 1 })
    carStatus({ ...change, overallFrame: 0, fuel: 99 })
    expect(source.getSnapshot()).toEqual(before)
    carStatus({ ...change, overallFrame: 1, fuel: 10, store: 1, age: 0 })
    expect(source.getSnapshot()).toMatchObject({
      identityRevision: 1, motion: null, lap: null, context: null, tyreWear: null,
      tyreStatus: { overallFrameId: 1, ageLaps: 0 }, fuel: { inTank: 10 }, ers: { storeEnergyJ: 1 }
    })
  })

  it('limpa ID 7 na transição confirmada por outro grupo e bloqueia UID aposentado', () => {
    carStatus()
    for (const overallFrame of [0, 1]) send(syntheticSession({ format, session: 50n, overallFrame }))
    const confirmed = source.getSnapshot()
    expect(confirmed).toMatchObject({ identityRevision: 1, fuel: null, ers: null, tyreStatus: null })
    for (const overallFrame of [201, 202]) carStatus({ overallFrame })
    expect(source.getSnapshot()).toEqual(confirmed)
    carStatus({ session: 50n, overallFrame: 0, fuel: 0 })
    expect(source.getSnapshot().fuel?.inTank).toBe(0)
  })

  it('não conta combustível e ERS do mesmo datagrama como confirmações separadas', () => {
    carStatus()
    carStatus({ session: 50n, overallFrame: 0 })
    send(syntheticTelemetry(6, { format, session: 50n, overallFrame: 100 }))
    expect(source.getSnapshot().identityRevision).toBe(0)
    vi.advanceTimersByTime(1000)
    carStatus({ session: 50n, overallFrame: 1 })
    expect(source.getSnapshot().identityRevision).toBe(0)
    carStatus({ session: 50n, overallFrame: 2 })
    expect(source.getSnapshot()).toMatchObject({ identityRevision: 1, motion: null, fuel: { inTank: 42.25 } })
  })

  it('truncamento não renova ID 7 nem cria candidata; null de campo avança o pacote válido', () => {
    carStatus()
    vi.advanceTimersByTime(2000)
    for (const overallFrame of [201, 202]) {
      send(syntheticCarStatus({ format, overallFrame }).subarray(0, 100))
      send(syntheticCarStatus({ format, session: 50n, overallFrame }).subarray(0, 100))
    }
    vi.advanceTimersByTime(1000)
    expect(source.getSnapshot()).toMatchObject({ identityRevision: 0, fuel: null, ers: null })
    carStatus({ overallFrame: 201, fuel: NaN, store: -1 })
    carStatus({ overallFrame: 201 }) // Não restaura valores pelo mesmo frame.
    expect(source.getSnapshot()).toMatchObject({ fuel: { inTank: null }, ers: { storeEnergyJ: null } })
  })

  it.each(['starting', 'stopped', 'error'] as const)('limpa tudo ao receber %s', (status) => {
    carStatus()
    receiverStatus(status)
    expect(source.getSnapshot()).toMatchObject({ identity: null, fuel: null, ers: null,
      tyreStatus: null, tyreStatusFreshness: 'waiting' })
  })

  it('mantém uma inscrição de datagramas e libera recursos/cancelamentos individualmente', () => {
    const listener = vi.fn()
    const first = source.subscribe(listener)
    const second = source.subscribe(listener)
    source.start()
    expect(packets.size).toBe(1)
    expect(diagnostics.size).toBe(1)
    expect(vi.getTimerCount()).toBe(1)
    first()
    first()
    listener.mockClear()
    carStatus()
    vi.advanceTimersByTime(100)
    expect(listener).toHaveBeenCalledTimes(1)
    second()
    listener.mockClear()
    source.stop()
    source.stop()
    expect(packets.size).toBe(0)
    expect(diagnostics.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    expect(source.getSnapshot()).toMatchObject({ fuel: null, ers: null, tyreStatus: null })
    expect(listener).not.toHaveBeenCalled()
    source.start()
    carStatus({ overallFrame: 0 })
    expect(source.getSnapshot().fuel?.inTank).toBe(42.25)
  })
})
