import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RealTelemetrySource, REAL_TELEMETRY_INTERVAL_MS, REAL_TELEMETRY_STALE_MS } from '../src/main/telemetry/RealTelemetrySource'
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
    send(first, { frame: 900 })
    expect(source.getSnapshot().status).toBe('receiving')
    expect(source.getSnapshot()[first === 2 ? 'motion' : 'lap']).toBeNull()
    send(second, { frame: 800, time: 8 })
    expect(source.getSnapshot()).toMatchObject({ motion: { speedKph: 287 }, lap: { number: 12 } })
  })

  it.each([
    { session: 9007199254740992n }, { format: 2026 as const }, { player: 4 }
  ])('limpa os dois grupos ao mudar a identidade: %o', (options) => {
    source.start()
    send(2)
    send(6)
    send(2, options)
    expect(source.getSnapshot()).toMatchObject({ motion: null, motionFreshness: 'waiting', lap: { number: 12 } })
    send(6, options)
    expect(source.getSnapshot().motion?.speedKph).toBe(287)
  })

  it('distingue sessões uint64 adjacentes acima do limite de number', () => {
    source.start()
    send(2, { session: 9007199254740992n })
    send(6, { session: 9007199254740993n })
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
    send(6, { speed: 0, gear: 0 })
    expect(source.getSnapshot()).toMatchObject({ status: 'stale', motion: { speedKph: 0, gear: 0 }, lap: null })
    send(2)
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

  it('aceita retrocessos de tempo, frame e volta e repetições sem filtrar', () => {
    source.start()
    send(6)
    send(2)
    send(6, { frame: 2, time: -1, speed: 80 })
    send(2, { frame: 1, time: -2, lap: 1 })
    expect(source.getSnapshot()).toMatchObject({
      motion: { speedKph: 80, frameId: 2, sessionTimeSeconds: -1 },
      lap: { number: 1, frameId: 1, sessionTimeSeconds: -2 }
    })
    vi.advanceTimersByTime(2000)
    send(2, { frame: 1, time: -2, lap: 1 })
    vi.advanceTimersByTime(1000)
    expect(source.getSnapshot().lapFreshness).toBe('fresh')
  })

  it('agrupa rajadas em 10 Hz, entrega o último valor e notifica expiração sem tráfego', () => {
    const listener = vi.fn()
    source.start()
    source.subscribe(listener)
    listener.mockClear()
    for (let speed = 0; speed <= 100; speed++) send(6, { speed })
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
})
