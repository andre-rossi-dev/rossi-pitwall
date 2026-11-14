import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SAMPLE_INTERVAL_MS, SimulatedTelemetrySource } from '../src/main/telemetry/SimulatedTelemetrySource'
import type { TelemetrySample, TelemetrySnapshot } from '../src/shared/telemetry'

describe('SimulatedTelemetrySource', () => {
  let source: SimulatedTelemetrySource

  beforeEach(() => {
    vi.useFakeTimers()
    source = new SimulatedTelemetrySource()
  })

  afterEach(() => {
    source.stop()
    vi.useRealTimers()
  })

  it('começa parada, sem timer e com origem simulada', () => {
    expect(source.getSnapshot()).toEqual({ origin: 'simulated', status: 'stopped', sample: null })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('gera amostras válidas durante duas voltas completas', () => {
    const samples: TelemetrySample[] = []
    source.subscribe(({ sample }) => { if (sample) samples.push(sample) })
    source.start()
    vi.advanceTimersByTime(120_000)

    expect(samples).toHaveLength(481)
    for (const sample of samples) {
      expect(Number.isInteger(sample.speedKph)).toBe(true)
      expect(sample.speedKph).toBeGreaterThanOrEqual(80)
      expect(sample.speedKph).toBeLessThanOrEqual(320)
      expect(Number.isInteger(sample.gear)).toBe(true)
      expect(sample.gear).toBeGreaterThanOrEqual(1)
      expect(sample.gear).toBeLessThanOrEqual(8)
      expect(sample.metadata.origin).toBe('simulated')
      expect(sample.metadata.protocolVersion).toBeNull()
      expect(sample.metadata.sessionId).toBe('simulation-v0.1')
    }
    expect(samples[240]?.lap).toBe(2)
    expect(samples[480]?.lap).toBe(3)
  })

  it('informa o estado atual ao inscrever um consumidor', () => {
    source.start()
    vi.advanceTimersByTime(1000)
    const listener = vi.fn()
    source.subscribe(listener)
    expect(listener).toHaveBeenCalledExactlyOnceWith(source.getSnapshot())
    expect(source.getSnapshot().sample?.metadata.frameId).toBe(4)
  })

  it('inicia imediatamente e emite no intervalo definido', () => {
    const listener = vi.fn()
    source.subscribe(listener)
    listener.mockClear()
    source.start()
    expect(listener).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(SAMPLE_INTERVAL_MS - 1)
    expect(listener).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(listener).toHaveBeenCalledTimes(2)
    expect(source.getSnapshot().sample?.metadata.sessionTimeSeconds).toBe(0.25)
  })

  it('não duplica o timer ao inicializar duas vezes', () => {
    const listener = vi.fn()
    source.subscribe(listener)
    source.start()
    source.start()
    expect(vi.getTimerCount()).toBe(1)
    expect(listener).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(1000)
    expect(listener).toHaveBeenCalledTimes(6)
  })

  it('distribui dados a vários consumidores', () => {
    const first = vi.fn()
    const second = vi.fn()
    source.subscribe(first)
    source.subscribe(second)
    source.start()
    vi.advanceTimersByTime(1000)
    expect(first.mock.calls).toEqual(second.mock.calls)
    expect(first).toHaveBeenCalledTimes(6)
  })

  it('cancela uma inscrição sem afetar as demais', () => {
    const first = vi.fn()
    const second = vi.fn()
    const unsubscribe = source.subscribe(first)
    source.subscribe(second)
    source.start()
    unsubscribe()
    unsubscribe()
    first.mockClear()
    second.mockClear()
    vi.advanceTimersByTime(1000)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(4)
  })

  it('mantém cancelamentos independentes para o mesmo callback', () => {
    const listener = vi.fn()
    const cancelFirst = source.subscribe(listener)
    const cancelSecond = source.subscribe(listener)
    cancelFirst()
    cancelFirst()
    listener.mockClear()
    source.start()
    expect(listener).toHaveBeenCalledTimes(1)
    cancelSecond()
    listener.mockClear()
    vi.advanceTimersByTime(1000)
    expect(listener).not.toHaveBeenCalled()
  })

  it('informa a parada e não emite mais nada após stop retornar', () => {
    const listener = vi.fn()
    source.subscribe(listener)
    source.start()
    source.stop()
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'stopped' }))
    expect(vi.getTimerCount()).toBe(0)
    listener.mockClear()
    source.stop()
    vi.advanceTimersByTime(60_000)
    expect(listener).not.toHaveBeenCalled()
  })

  it('recomeça a sequência previsível depois de parar', () => {
    source.start()
    const initial = source.getSnapshot()
    vi.advanceTimersByTime(5000)
    source.stop()
    source.start()
    expect(source.getSnapshot()).toEqual(initial)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('produz a mesma sequência em instâncias independentes', () => {
    const other = new SimulatedTelemetrySource()
    const first: TelemetrySnapshot[] = []
    const second: TelemetrySnapshot[] = []
    source.subscribe((snapshot) => first.push(snapshot))
    other.subscribe((snapshot) => second.push(snapshot))
    try {
      source.start()
      other.start()
      vi.advanceTimersByTime(10_000)
      expect(first).toEqual(second)
      expect(first).toHaveLength(42)
      expect(first[1]?.sample).toMatchObject({ speedKph: 80, gear: 2, lap: 1 })
      expect(first.at(-1)?.sample).toMatchObject({ speedKph: 140, gear: 4, lap: 1 })
    } finally {
      other.stop()
    }
  })

  it('protege amostras e metadados contra mutação por consumidores', () => {
    source.start()
    const snapshot = source.getSnapshot()
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.sample)).toBe(true)
    expect(Object.isFrozen(snapshot.sample?.metadata)).toBe(true)
  })
})
