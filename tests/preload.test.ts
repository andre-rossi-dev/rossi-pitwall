import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PitwallApi } from '../src/shared/ipc'
import { TELEMETRY_CHANNEL, UDP_DIAGNOSTICS_CHANNEL, UDP_DIAGNOSTICS_REQUEST_CHANNEL } from '../src/shared/ipc'
import type { TelemetrySnapshot } from '../src/shared/telemetry'

const electron = vi.hoisted(() => ({ exposeInMainWorld: vi.fn(), send: vi.fn() }))
const emitter = new EventEmitter()
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: electron.exposeInMainWorld },
  ipcRenderer: Object.assign(emitter, { send: electron.send })
}))

describe('ponte restrita do preload', () => {
  let api: PitwallApi
  const snapshot: TelemetrySnapshot = { origin: 'simulated', status: 'stopped', sample: null }

  beforeEach(async () => {
    vi.resetModules()
    emitter.removeAllListeners()
    await import('../src/preload/index')
    api = electron.exposeInMainWorld.mock.calls[0]?.[1] as PitwallApi
  })

  it('expõe somente inscrições nos canais de telemetria e diagnóstico', () => {
    expect(electron.exposeInMainWorld).toHaveBeenCalledWith('pitwall', api)
    expect(Object.keys(api)).toEqual(['onTelemetry', 'onUdpDiagnostics'])
    expect(Object.isFrozen(api)).toBe(true)
  })

  it('isola o diagnóstico UDP e cancela inscrições sem acumular listeners', () => {
    const first = vi.fn()
    const second = vi.fn()
    const telemetry = vi.fn()
    const cancelTelemetry = api.onTelemetry(telemetry)
    api.onUdpDiagnostics(first)()
    const cancelFirst = api.onUdpDiagnostics(first)
    const cancelSecond = api.onUdpDiagnostics(second)
    expect(electron.send).toHaveBeenCalledTimes(3)
    for (const call of electron.send.mock.calls) expect(call).toEqual([UDP_DIAGNOSTICS_REQUEST_CHANNEL])
    const diagnostic = { status: 'listening', packetsReceived: 0 }
    emitter.emit(UDP_DIAGNOSTICS_CHANNEL, { sender: 'privilegiado' }, diagnostic)
    expect(first).toHaveBeenCalledExactlyOnceWith(diagnostic)
    expect(second).toHaveBeenCalledExactlyOnceWith(diagnostic)
    expect(telemetry).not.toHaveBeenCalled()
    cancelFirst()
    cancelFirst()
    expect(emitter.listenerCount(UDP_DIAGNOSTICS_CHANNEL)).toBe(1)
    cancelSecond()
    cancelTelemetry()
    expect(emitter.eventNames()).toEqual([])
  })

  it('entrega somente os dados, sem expor o evento IPC', () => {
    const callback = vi.fn()
    api.onTelemetry(callback)
    emitter.emit('outro-canal', {}, snapshot)
    expect(callback).not.toHaveBeenCalled()
    emitter.emit(TELEMETRY_CHANNEL, { sender: 'privilegiado' }, snapshot)
    expect(callback).toHaveBeenCalledExactlyOnceWith(snapshot)
  })

  it('registra o listener UDP antes de solicitar o snapshot inicial', () => {
    const diagnostic = { status: 'error', error: 'fixture: porta ocupada' }
    electron.send.mockImplementationOnce(() => {
      emitter.emit(UDP_DIAGNOSTICS_CHANNEL, { sender: 'privilegiado' }, diagnostic)
    })
    const callback = vi.fn()
    const cancel = api.onUdpDiagnostics(callback)
    expect(callback).toHaveBeenCalledExactlyOnceWith(diagnostic)
    cancel()
    expect(emitter.listenerCount(UDP_DIAGNOSTICS_CHANNEL)).toBe(0)
  })

  it('remove apenas o listener da inscrição cancelada', () => {
    const first = vi.fn()
    const second = vi.fn()
    const unsubscribe = api.onTelemetry(first)
    const unsubscribeSecond = api.onTelemetry(second)
    unsubscribe()
    unsubscribe()
    emitter.emit(TELEMETRY_CHANNEL, {}, snapshot)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledExactlyOnceWith(snapshot)
    unsubscribeSecond()
    expect(emitter.listenerCount(TELEMETRY_CHANNEL)).toBe(0)
  })

  it('não acumula listeners no ciclo montar, desmontar e remontar do React', () => {
    const callback = vi.fn()
    api.onTelemetry(callback)()
    const unsubscribe = api.onTelemetry(callback)
    expect(emitter.listenerCount(TELEMETRY_CHANNEL)).toBe(1)
    emitter.emit(TELEMETRY_CHANNEL, {}, snapshot)
    expect(callback).toHaveBeenCalledTimes(1)
    unsubscribe()
    expect(emitter.listenerCount(TELEMETRY_CHANNEL)).toBe(0)
  })
})
