import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PitwallApi } from '../src/shared/ipc'
import { TELEMETRY_CHANNEL } from '../src/shared/ipc'
import type { TelemetrySnapshot } from '../src/shared/telemetry'

const electron = vi.hoisted(() => ({ exposeInMainWorld: vi.fn() }))
const emitter = new EventEmitter()
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: electron.exposeInMainWorld },
  ipcRenderer: emitter
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

  it('expõe somente a inscrição no canal de telemetria', () => {
    expect(electron.exposeInMainWorld).toHaveBeenCalledWith('pitwall', api)
    expect(Object.keys(api)).toEqual(['onTelemetry'])
    expect(Object.isFrozen(api)).toBe(true)
  })

  it('entrega somente os dados, sem expor o evento IPC', () => {
    const callback = vi.fn()
    api.onTelemetry(callback)
    emitter.emit('outro-canal', {}, snapshot)
    expect(callback).not.toHaveBeenCalled()
    emitter.emit(TELEMETRY_CHANNEL, { sender: 'privilegiado' }, snapshot)
    expect(callback).toHaveBeenCalledExactlyOnceWith(snapshot)
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
