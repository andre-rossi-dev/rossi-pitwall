import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RealTelemetrySource } from '../src/main/telemetry/RealTelemetrySource'
import { UdpReceiver } from '../src/main/udp/UdpReceiver'
import type { UdpDiagnosticListener, UdpStatus } from '../src/shared/udp'
import { syntheticTelemetry } from './fixtures/f1-telemetry'
import { syntheticSession } from './fixtures/f1-session'
import { syntheticCarStatus } from './fixtures/f1-car-status'
import { syntheticTyres } from './fixtures/f1-tyres'
import { racePositionPresentation } from '../src/renderer/src/racePosition'

describe.each([2025, 2026] as const)('posição/diferenças %i — fonte com dados sintéticos', (format) => {
  let source: RealTelemetrySource
  let packets: Set<(packet: Buffer) => void>
  let diagnostics: Set<UdpDiagnosticListener>
  const send = (packet: Buffer) => packets.forEach((callback) => callback(packet))
  const lap = (options: Parameters<typeof syntheticTelemetry>[1] = {}) => send(syntheticTelemetry(2, { format, ...options }))
  const status = (value: UdpStatus) => diagnostics.forEach((callback) => callback({ ...new UdpReceiver().getSnapshot(), status: value }))

  beforeEach(() => {
    vi.useFakeTimers()
    packets = new Set()
    diagnostics = new Set()
    source = new RealTelemetrySource({
      subscribeDatagrams(callback) { packets.add(callback); return () => { packets.delete(callback) } },
      subscribe(callback) { diagnostics.add(callback); return () => { diagnostics.delete(callback) } }
    })
    source.start()
  })
  afterEach(() => { source.stop(); vi.useRealTimers() })

  it('atualiza todo ID 2 em uma publicação, inclusive desconhecidos, sem afetar outros grupos', () => {
    send(syntheticTelemetry(6, { format }))
    send(syntheticCarStatus({ format }))
    send(syntheticTyres(10, { format }))
    send(syntheticSession({ format, sessionType: 15 }))
    lap()
    const before = source.getSnapshot()
    expect(Object.isFrozen(before.lap)).toBe(true)
    const listener = vi.fn()
    source.subscribe(listener)
    listener.mockClear()
    lap({ overallFrame: 201, lap: 13, position: 0, frontMS: 0, leaderMS: 65535, leaderMinutes: 255 })
    vi.advanceTimersByTime(100)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.lastCall?.[0]).toMatchObject({
      lap: { number: 13, carPosition: 0, deltaToCarInFrontMSPart: 0,
        deltaToRaceLeaderMSPart: 65535, deltaToRaceLeaderMinutesPart: 255 },
      motion: before.motion, tyreStatus: before.tyreStatus, tyreWear: before.tyreWear,
      fuel: before.fuel, ers: before.ers, context: before.context
    })
    expect(before.lap?.carPosition).toBe(5)
  })

  it('rejeita duplicações, atrasos e meia faixa sem renovar; aceita wraparound', () => {
    lap({ overallFrame: 0xfffffffe })
    const before = source.getSnapshot()
    vi.advanceTimersByTime(2000)
    for (const overallFrame of [0xfffffffe, 0xfffffffd, 0x7ffffffe]) {
      lap({ overallFrame, position: 1, lap: 99, frontMS: 0, leaderMinutes: 0 })
      expect(source.getSnapshot()).toEqual(before)
    }
    vi.advanceTimersByTime(1000)
    expect(source.getSnapshot()).toMatchObject({ lap: null, lapFreshness: 'stale' })
    lap({ overallFrame: 1, position: 2, frontMS: 1 })
    expect(source.getSnapshot().lap).toMatchObject({ overallFrameId: 1, carPosition: 2, deltaToCarInFrontMSPart: 1 })
  })

  it('aceita ultrapassagens, perda de posições e flashback de volta/posição/gaps', () => {
    lap()
    lap({ overallFrame: 201, position: 8, lap: 14, frontMS: 9000, leaderMinutes: 2 })
    expect(source.getSnapshot().lap?.carPosition).toBe(8)
    lap({ overallFrame: 202, position: 7, lap: 14 })
    expect(source.getSnapshot().lap?.carPosition).toBe(7)
    lap({ overallFrame: 203, frame: 1, time: -1, position: 3, lap: 2, frontMS: 100, leaderMS: 200, leaderMinutes: 0 })
    expect(source.getSnapshot().lap).toMatchObject({
      frameId: 1, sessionTimeSeconds: -1, number: 2, carPosition: 3,
      deltaToCarInFrontMSPart: 100, deltaToRaceLeaderMSPart: 200, deltaToRaceLeaderMinutesPart: 0
    })
    lap({ overallFrame: 202, position: 7, lap: 14 })
    expect(source.getSnapshot().lap?.carPosition).toBe(3)
  })

  it('expira em 3000 ms enquanto outros IDs continuam; silêncio/pausa não limpam identidade', () => {
    lap()
    const identity = source.getSnapshot().identity
    const listener = vi.fn()
    source.subscribe(listener)
    vi.advanceTimersByTime(2000)
    send(syntheticTelemetry(6, { format }))
    send(syntheticSession({ format, sessionType: 15 }))
    send(syntheticCarStatus({ format }))
    send(syntheticTyres(10, { format }))
    lap() // Uma pausa que repete o contador não mantém o grupo fresco.
    vi.advanceTimersByTime(999)
    expect(source.getSnapshot().lap).not.toBeNull()
    vi.advanceTimersByTime(1)
    expect(listener.mock.lastCall?.[0]).toMatchObject({ lap: null, lapFreshness: 'stale',
      motion: { speedKph: 287 }, tyreStatus: { ageLaps: 8 }, fuel: { inTank: 42.25 } })
    status('idle')
    vi.advanceTimersByTime(60000)
    lap()
    expect(source.getSnapshot()).toMatchObject({ identity, lap: null })
    lap({ overallFrame: 201, position: 2 })
    expect(source.getSnapshot()).toMatchObject({ identity, lap: { carPosition: 2 } })
    expect(racePositionPresentation(source.getSnapshot()).position).toBe('—') // Contexto venceu.
    send(syntheticSession({ format, sessionType: 15, overallFrame: 201 }))
    expect(racePositionPresentation(source.getSnapshot()).position).toBe('P2')
  })

  it.each([{ session: 50n }, { player: 4 }, { format: format === 2025 ? 2026 as const : 2025 as const }])(
    'confirma identidade pelo grupo, sem contar os campos como confirmações: %o', (change) => {
      lap()
      send(syntheticSession({ format, sessionType: 15 }))
      send(syntheticCarStatus({ format }))
      const before = source.getSnapshot()
      lap({ ...change, overallFrame: 0, position: 1 })
      lap({ ...change, overallFrame: 0, position: 2 })
      expect(source.getSnapshot()).toEqual(before)
      lap({ ...change, overallFrame: 1, position: 3, frontMS: 300, leaderMinutes: 0 })
      expect(source.getSnapshot()).toMatchObject({ identityRevision: 1, context: null, fuel: null, ers: null,
        tyreStatus: null, lap: { carPosition: 3, deltaToCarInFrontMSPart: 300, deltaToRaceLeaderMinutesPart: 0 } })
      expect(racePositionPresentation(source.getSnapshot()).position).toBe('—')
    })

  it('limpa Lap Data em transição confirmada por outro grupo e bloqueia UID aposentado', () => {
    lap()
    for (const overallFrame of [0, 1]) send(syntheticSession({ format, session: 50n, overallFrame, sessionType: 15 }))
    const before = source.getSnapshot()
    expect(before.lap).toBeNull()
    for (const overallFrame of [201, 202]) lap({ overallFrame })
    expect(source.getSnapshot()).toEqual(before)
    lap({ session: 50n, overallFrame: 0, position: 9 })
    expect(racePositionPresentation(source.getSnapshot()).position).toBe('P9')
  })

  it('contexto vencido/conflitante oculta posição sem descartar a volta técnica', () => {
    send(syntheticSession({ format, sessionType: 15 }))
    vi.advanceTimersByTime(3000)
    lap()
    expect(racePositionPresentation(source.getSnapshot()).position).toBe('—')
    send(syntheticSession({ format, sessionType: 15, overallFrame: 201 }))
    expect(racePositionPresentation(source.getSnapshot()).position).toBe('P5')
    send(syntheticSession({ format, sessionType: 1, overallFrame: 202 }))
    expect(racePositionPresentation(source.getSnapshot()).position).toBe('—')
    expect(source.getSnapshot().lap?.number).toBe(12)
  })

  it('truncamento e versão incompatível não atualizam nem renovam o grupo', () => {
    lap()
    vi.advanceTimersByTime(2000)
    send(syntheticTelemetry(2, { format, overallFrame: 201 }).subarray(0, 100))
    const invalid = syntheticTelemetry(2, { format, overallFrame: 202 })
    invalid[5] = 2
    send(invalid)
    vi.advanceTimersByTime(1000)
    expect(source.getSnapshot()).toMatchObject({ lap: null, lapFreshness: 'stale' })
  })

  it.each(['starting', 'stopped', 'error'] as const)('limpa os novos campos ao receber %s', (value) => {
    lap()
    status(value)
    expect(source.getSnapshot()).toMatchObject({ identity: null, lap: null, lapFreshness: 'waiting' })
  })

  it('mantém inscrição única e cancela individualmente, encerrando timers e estado', () => {
    source.start()
    expect(packets.size).toBe(1)
    expect(diagnostics.size).toBe(1)
    expect(vi.getTimerCount()).toBe(1)
    const listener = vi.fn()
    const first = source.subscribe(listener)
    const second = source.subscribe(listener)
    first(); first()
    listener.mockClear()
    lap()
    vi.advanceTimersByTime(100)
    expect(listener).toHaveBeenCalledTimes(1)
    second()
    listener.mockClear()
    source.stop(); source.stop()
    expect(listener).not.toHaveBeenCalled()
    expect(packets.size).toBe(0)
    expect(diagnostics.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    expect(source.getSnapshot().lap).toBeNull()
  })
})
