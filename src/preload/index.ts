import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { TELEMETRY_CHANNEL, UDP_DIAGNOSTICS_CHANNEL, UDP_DIAGNOSTICS_REQUEST_CHANNEL,
  REAL_TELEMETRY_CHANNEL, REAL_TELEMETRY_REQUEST_CHANNEL } from '../shared/ipc'
import type { PitwallApi } from '../shared/ipc'
import type { TelemetrySnapshot } from '../shared/telemetry'
import type { UdpDiagnosticSnapshot } from '../shared/udp'
import type { RealTelemetrySnapshot } from '../shared/realTelemetry'

const api: PitwallApi = {
  onTelemetry(callback) {
    // O evento Electron nunca atravessa a ponte para o Renderer.
    const listener = (_event: IpcRendererEvent, snapshot: TelemetrySnapshot): void => {
      callback(snapshot)
    }
    ipcRenderer.on(TELEMETRY_CHANNEL, listener)
    return () => { ipcRenderer.removeListener(TELEMETRY_CHANNEL, listener) }
  },
  onUdpDiagnostics(callback) {
    const listener = (_event: IpcRendererEvent, snapshot: UdpDiagnosticSnapshot): void => {
      callback(snapshot)
    }
    ipcRenderer.on(UDP_DIAGNOSTICS_CHANNEL, listener)
    // A inscrição React pode ocorrer depois de did-finish-load. Solicita só o estado atual.
    ipcRenderer.send(UDP_DIAGNOSTICS_REQUEST_CHANNEL)
    return () => { ipcRenderer.removeListener(UDP_DIAGNOSTICS_CHANNEL, listener) }
  },
  onRealTelemetry(callback) {
    const listener = (_event: IpcRendererEvent, snapshot: RealTelemetrySnapshot): void => {
      callback(snapshot)
    }
    ipcRenderer.on(REAL_TELEMETRY_CHANNEL, listener)
    ipcRenderer.send(REAL_TELEMETRY_REQUEST_CHANNEL)
    return () => { ipcRenderer.removeListener(REAL_TELEMETRY_CHANNEL, listener) }
  }
}

contextBridge.exposeInMainWorld('pitwall', Object.freeze(api))
