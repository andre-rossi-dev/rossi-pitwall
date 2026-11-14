import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { TELEMETRY_CHANNEL } from '../shared/ipc'
import type { PitwallApi } from '../shared/ipc'
import type { TelemetrySnapshot } from '../shared/telemetry'

const api: PitwallApi = {
  onTelemetry(callback) {
    // O evento Electron nunca atravessa a ponte para o Renderer.
    const listener = (_event: IpcRendererEvent, snapshot: TelemetrySnapshot): void => {
      callback(snapshot)
    }
    ipcRenderer.on(TELEMETRY_CHANNEL, listener)
    return () => { ipcRenderer.removeListener(TELEMETRY_CHANNEL, listener) }
  }
}

contextBridge.exposeInMainWorld('pitwall', Object.freeze(api))
