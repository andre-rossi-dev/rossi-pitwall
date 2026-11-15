import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RealTelemetrySource, REAL_TELEMETRY_INTERVAL_MS, REAL_TELEMETRY_STALE_MS,
  IDENTITY_CONFIRMATION_MS, RETIRED_SESSION_LIMIT
} from '../src/main/telemetry/RealTelemetrySource'
import { UdpReceiver } from '../src/main/udp/UdpReceiver'
import type { UdpDiagnosticListener, UdpStatus } from '../src/shared/udp'
import { syntheticTelemetry } from './fixtures/f1-telemetry'

describe('estado de telemetria real (fixtures sintéticas, relógio controlado)', () => {
  let source: RealTelemetrySource
  let packets: Set<(packet: Buffer) => void>
  let diagnostics: Set<UdpDiagnosticListener>
  const send = (id: 2 | 6, options?: Parameters<typeof syntheticTelemetry>[1]) => {
    const packet = syntheticTelemetry(id, options)
    packets.forEach((callback) => callback(packet))
  }
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
        callback(new UdpReceiver().getSnapshot())
        return () => { diagnostics.delete(callback) }
      }
    })
  })
  afterEach(() => { source.stop(); vi.useRealTimers() })

  it('inicia sem medições e não fabrica valores com o tempo', () => {
    expect(source.getSnapshot().status).toBe('stopped')
    source.start()
    vi.advanceTimersByTime(60000)
    expect(source.getSnapshot()).toMatchObject({ status: 'waiting', identity: null, motion: null, lap: null })
  })

  it.each([[2, 6], [6, 2]] as const)('aceita ordem %j / %j e frames diferentes', (first, second) => {
    source.start()
    send(first, { frame: 900, overallFrame: 900 })
    expect(source.getSnapshot().status).toBe('receiving')
    expect(source.getSnapshot()[first === 2 ? 'motion' : 'lap']).toBeNull()
    send(second, { frame: 800, overallFrame: 800, time: 8 })
    expect(source.getSnapshot()).toMatchObject({ motion: { speedKph: 287 }, lap: { number: 12 } })
  })

  it.each([
    { session: 9007199254740992n }, { format: 2026 as const }, { player: 4 }
  ])('confirma a identidade com avanço no mesmo grupo e limpa dados anteriores: %o', (options) => {
    source.start()
    send(2)
    send(6)
    const original = source.getSnapshot()
    send(2, options)
    expect(source.getSnapshot()).toEqual(original)
    send(2, { ...options, overallFrame: 201 })
    expect(source.getSnapshot()).toMatchObject({ motion: null, motionFreshness: 'waiting', lap: { number: 12 } })
    send(6, options)
    expect(source.getSnapshot().motion?.speedKph).toBe(287)
  })

  it('distingue sessões uint64 adjacentes acima do limite de number', () => {
    source.start()
    send(2, { session: 9007199254740992n })
    send(6, { session: 9007199254740993n })
    send(6, { session: 9007199254740993n, overallFrame: 201 })
    expect(source.getSnapshot()).toMatchObject({ identity: { sessionId: '9007199254740993' }, lap: null })
  })

  it('expira cada grupo independentemente no limite exato e retoma', () => {
    source.start()
    send(6)
    vi.advanceTimersByTime(1000)
    send(2)
    vi.advanceTimersByTime(REAL_TELEMETRY_STALE_MS - 1001)
    expect(source.getSnapshot().motionFreshness).toBe('fresh')
    vi.advanceTimersByTime(1)
    expect(source.getSnapshot()).toMatchObject({ status: 'stale', motion: null, motionFreshness: 'stale', lapFreshness: 'fresh' })
    vi.advanceTimersByTime(1000)
    expect(source.getSnapshot()).toMatchObject({ motion: null, lap: null, lapFreshness: 'stale' })
    send(6, { speed: 0, gear: 0, overallFrame: 201 })
    expect(source.getSnapshot()).toMatchObject({ status: 'stale', motion: { speedKph: 0, gear: 0 }, lap: null })
    send(2, { overallFrame: 201 })
    expect(source.getSnapshot().status).toBe('receiving')
  })

  it('pacotes rejeitados e tráfego de outros IDs não renovam nem trocam a sessão', () => {
    source.start()
    send(6)
    const packet = syntheticTelemetry(6, { session: 456n })
    vi.advanceTimersByTime(2000)
    packet[5] = 2
    packets.forEach((callback) => callback(packet))
    packet[5] = 1
    packet[6] = 1
    packets.forEach((callback) => callback(packet))
    vi.advanceTimersByTime(1000)
    expect(source.getSnapshot()).toMatchObject({ status: 'stale', identity: { sessionId: '18446744073709551615' }, motion: null })
  })

  it.each([2025, 2026] as const)('preserva flashback de tempo, frame e volta no formato %i', (format) => {
    source.start()
    send(6, { format })
    send(2, { format })
    send(6, { format, frame: 2, overallFrame: 202, time: -1, speed: 80 })
    send(2, { format, frame: 1, overallFrame: 201, time: -2, lap: 1 })
    expect(source.getSnapshot()).toMatchObject({
      motion: { speedKph: 80, frameId: 2, sessionTimeSeconds: -1 },
      lap: { number: 1, frameId: 1, sessionTimeSeconds: -2 }
    })
    // Pacote pré-flashback atrasado não restaura a volta anterior.
    send(2, { format, overallFrame: 200, lap: 12 })
    expect(source.getSnapshot().lap?.number).toBe(1)
  })

  it('agrupa rajadas em 10 Hz, entrega o último valor e notifica expiração sem tráfego', () => {
    const listener = vi.fn()
    source.start()
    source.subscribe(listener)
    listener.mockClear()
    for (let speed = 0; speed <= 100; speed++) send(6, { speed, overallFrame: 200 + speed })
    expect(listener).not.toHaveBeenCalled()
    vi.advanceTimersByTime(REAL_TELEMETRY_INTERVAL_MS)
    expect(listener).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ motion: expect.objectContaining({ speedKph: 100 }) }))
    vi.advanceTimersByTime(REAL_TELEMETRY_STALE_MS)
    expect(listener).toHaveBeenCalledTimes(2)
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'stale', motion: null }))
  })

  it.each(['starting', 'stopped', 'error'] as const)('invalida dados ao receptor ficar %s', (value) => {
    source.start()
    send(6)
    send(2)
    status(value)
    expect(source.getSnapshot()).toMatchObject({ identity: null, motion: null, lap: null })
  })

  it('cancela inscrições individualmente, encerra timers e reinscreve sem duplicar', () => {
    source.start()
    source.start()
    expect(vi.getTimerCount()).toBe(1)
    expect(packets.size).toBe(1)
    const listener = vi.fn()
    const cancelFirst = source.subscribe(listener)
    const cancelSecond = source.subscribe(listener)
    cancelFirst()
    cancelFirst()
    listener.mockClear()
    send(6)
    vi.advanceTimersByTime(100)
    expect(listener).toHaveBeenCalledTimes(1)
    source.stop()
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'stopped', motion: null }))
    expect(packets.size).toBe(0)
    expect(diagnostics.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    listener.mockClear()
    source.stop()
    vi.advanceTimersByTime(60000)
    expect(listener).not.toHaveBeenCalled()
    cancelSecond()
    source.start()
    expect(listener).not.toHaveBeenCalled()
    expect(source.getSnapshot().identity).toBeNull()
  })

  it('snapshot inicial é atual e suas medições são imutáveis', () => {
    source.start()
    send(6)
    send(2)
    const listener = vi.fn()
    source.subscribe(listener)
    expect(listener).toHaveBeenCalledExactlyOnceWith(source.getSnapshot())
    const snapshot = source.getSnapshot()
    for (const item of [snapshot, snapshot.identity, snapshot.motion, snapshot.lap]) expect(Object.isFrozen(item)).toBe(true)
  })

  it.each([2025, 2026] as const)('atualiza em ordem e rejeita atrasos e duplicações por grupo em %i', (format) => {
    source.start()
    send(6, { format, overallFrame: 10, speed: 100 })
    send(2, { format, overallFrame: 2, lap: 1 })
    send(6, { format, overallFrame: 11, speed: 101 })
    send(6, { format, overallFrame: 12, speed: 102 })
    send(2, { format, overallFrame: 3, lap: 2 })
    const latest = source.getSnapshot()
    expect(latest).toMatchObject({ motion: { speedKph: 102 }, lap: { number: 2 } })
    send(6, { format, overallFrame: 11, speed: 99 })
    send(2, { format, overallFrame: 2, lap: 1 })
    // Mesmo contador com payload conflitante: a primeira amostra prevalece.
    send(6, { format, overallFrame: 12, speed: 999 })
    send(2, { format, overallFrame: 3, lap: 99 })
    expect(source.getSnapshot()).toEqual(latest)
  })

  it.each([2, 6] as const)('duplicações e atrasos do ID %i não renovam frescor nem publicam', (id) => {
    source.start()
    send(id)
    vi.advanceTimersByTime(100)
    const listener = vi.fn()
    source.subscribe(listener)
    listener.mockClear()
    vi.advanceTimersByTime(1900)
    send(id)
    send(id, { overallFrame: 199 })
    vi.advanceTimersByTime(999)
    expect(source.getSnapshot().status).toBe('receiving')
    expect(listener).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(source.getSnapshot()).toMatchObject({ status: 'stale', motion: null, lap: null })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it.each([2025, 2026] as const)('aceita wraparound e rejeita atraso através do zero em %i', (format) => {
    source.start()
    for (const id of [2, 6] as const) {
      send(id, { format, overallFrame: 0xfffffffe })
      send(id, { format, overallFrame: 0xffffffff })
      send(id, { format, overallFrame: 0, speed: 80, lap: 1 })
      send(id, { format, overallFrame: 1, speed: 81, lap: 2 })
      send(id, { format, overallFrame: 0xffffffff, speed: 999, lap: 99 })
    }
    expect(source.getSnapshot()).toMatchObject({
      motion: { overallFrameId: 1, speedKph: 81 }, lap: { overallFrameId: 1, number: 2 }
    })
  })

  it.each([
    [0, 0x7fffffff, true], [0, 0x80000000, false], [0, 0x80000001, false],
    [0x80000000, 0, false], [0xffffffff, 0x7ffffffe, true], [0xffffffff, 0x7fffffff, false]
  ] as const)('compara %i → %i defensivamente (aceito: %s)', (previous, next, accepted) => {
    source.start()
    send(6, { overallFrame: previous, speed: 100 })
    send(6, { overallFrame: next, speed: 200 })
    expect(source.getSnapshot().motion?.speedKph).toBe(accepted ? 200 : 100)
  })

  it('mantém identidade e referências de ordem após silêncio/idle e retoma só com amostra nova', () => {
    source.start()
    send(2)
    send(6)
    const identity = source.getSnapshot().identity
    vi.advanceTimersByTime(60000)
    status('idle')
    expect(source.getSnapshot().identity).toEqual(identity)
    send(6)
    send(2, { overallFrame: 199 })
    expect(source.getSnapshot()).toMatchObject({ status: 'stale', motion: null, lap: null })
    send(6, { overallFrame: 201 })
    send(2, { overallFrame: 202, lap: 1, time: 1, frame: 1 })
    expect(source.getSnapshot()).toMatchObject({ status: 'receiving', identity, lap: { number: 1 } })
  })

  it('não confirma sessão com duplicatas, atrasos ou apenas grupos distintos', () => {
    source.start()
    send(6, { session: 1n, overallFrame: 1000 })
    send(6, { session: 2n, overallFrame: 10 })
    send(6, { session: 2n, overallFrame: 10 })
    send(6, { session: 2n, overallFrame: 9 })
    send(6, { session: 2n, overallFrame: 0x8000000a })
    send(2, { session: 2n, overallFrame: 1, lap: 1 })
    expect(source.getSnapshot().identity?.sessionId).toBe('1')
    send(2, { session: 2n, overallFrame: 2, lap: 2 })
    expect(source.getSnapshot()).toMatchObject({
      identity: { sessionId: '2' }, motion: { overallFrameId: 10 }, lap: { number: 2, overallFrameId: 2 }
    })
  })

  it('bloqueia rajadas de sessões substituídas, inclusive após expiração', () => {
    source.start()
    send(6, { session: 1n, overallFrame: 1000 })
    send(2, { session: 2n, overallFrame: 1 })
    send(2, { session: 2n, overallFrame: 2 })
    for (const overallFrame of [999, 1000, 1001, 1002]) send(6, { session: 1n, overallFrame })
    expect(source.getSnapshot()).toMatchObject({ identity: { sessionId: '2' }, motion: null })
    vi.advanceTimersByTime(60000)
    send(6, { session: 1n, overallFrame: 2000 })
    send(6, { session: 1n, overallFrame: 2001 })
    expect(source.getSnapshot()).toMatchObject({ identity: { sessionId: '2' }, status: 'stale' })
    send(2, { session: 2n, overallFrame: 3 })
    expect(source.getSnapshot().status).toBe('receiving')
  })

  it.each([2025, 2026] as const)('permite alternar formato a partir de %i e voltar, sem comparar contadores entre identidades', (format) => {
    source.start()
    send(6, { format, overallFrame: 4000 })
    for (const next of [format === 2025 ? 2026 : 2025, format] as const) {
      send(2, { format: next, overallFrame: 0 })
      send(2, { format: next, overallFrame: 1 })
      expect(source.getSnapshot()).toMatchObject({ identity: { packetFormat: next }, motion: null, lap: { overallFrameId: 1 } })
    }
  })

  it('exige confirmação novamente quando chega avanço da identidade ativa', () => {
    source.start()
    send(6, { session: 1n })
    send(2, { session: 2n })
    send(6, { session: 1n, overallFrame: 201 })
    send(2, { session: 2n, overallFrame: 201 })
    expect(source.getSnapshot().identity?.sessionId).toBe('1')
    send(2, { session: 2n, overallFrame: 202 })
    expect(source.getSnapshot().identity?.sessionId).toBe('2')
  })

  it('substitui candidata ao receber uma terceira identidade', () => {
    source.start()
    send(6, { session: 1n })
    send(2, { session: 2n })
    send(2, { session: 3n })
    send(2, { session: 2n, overallFrame: 201 })
    expect(source.getSnapshot().identity?.sessionId).toBe('1')
    send(2, { session: 2n, overallFrame: 202 })
    expect(source.getSnapshot().identity?.sessionId).toBe('2')
  })

  it('expira a confirmação no limite exato sem renovar por duplicações', () => {
    source.start()
    send(6, { session: 1n })
    send(2, { session: 2n })
    vi.advanceTimersByTime(IDENTITY_CONFIRMATION_MS - 1)
    send(2, { session: 2n })
    vi.advanceTimersByTime(1)
    send(2, { session: 2n, overallFrame: 201 })
    expect(source.getSnapshot().identity?.sessionId).toBe('1')
    send(2, { session: 2n, overallFrame: 202 })
    expect(source.getSnapshot().identity?.sessionId).toBe('2')
  })

  it('preserva os instantes originais dos grupos guardados durante confirmação', () => {
    source.start()
    send(6, { session: 1n })
    send(2, { session: 2n })
    vi.advanceTimersByTime(500)
    send(6, { session: 2n })
    vi.advanceTimersByTime(499)
    send(6, { session: 2n, overallFrame: 201 })
    vi.advanceTimersByTime(REAL_TELEMETRY_STALE_MS - 999)
    expect(source.getSnapshot()).toMatchObject({ lapFreshness: 'stale', motionFreshness: 'fresh' })
  })

  it('limita a memória de UIDs substituídos e descarta o mais antigo', () => {
    source.start()
    send(6, { session: 0n })
    for (let session = 1n; session <= BigInt(RETIRED_SESSION_LIMIT + 1); session++) {
      send(6, { session })
      send(6, { session, overallFrame: 201 })
    }
    send(6, { session: 1n, overallFrame: 300 })
    send(6, { session: 1n, overallFrame: 301 })
    expect(source.getSnapshot().identity?.sessionId).toBe(String(RETIRED_SESSION_LIMIT + 1))
    send(6, { session: 0n })
    send(6, { session: 0n, overallFrame: 201 })
    expect(source.getSnapshot().identity?.sessionId).toBe('0')
  })

  it('limpa candidatas, UIDs substituídos e ordem ao reiniciar o receptor ou a fonte', () => {
    source.start()
    send(6, { session: 1n })
    send(6, { session: 2n })
    send(6, { session: 2n, overallFrame: 201 })
    send(2, { session: 3n })
    status('starting')
    send(6, { session: 1n, overallFrame: 0 })
    expect(source.getSnapshot()).toMatchObject({ identity: { sessionId: '1' }, motion: { overallFrameId: 0 }, lap: null })
    send(2, { session: 3n, overallFrame: 201 })
    expect(source.getSnapshot().identity?.sessionId).toBe('1')
    source.stop()
    source.start()
    send(6, { session: 2n, overallFrame: 0 })
    expect(source.getSnapshot()).toMatchObject({ identity: { sessionId: '2' }, motion: { overallFrameId: 0 }, lap: null })
  })
})
