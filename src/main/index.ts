import { app, BrowserWindow, ipcMain } from 'electron'
import type { IpcMainEvent } from 'electron'
import { join } from 'node:path'
import { TELEMETRY_CHANNEL, UDP_DIAGNOSTICS_CHANNEL, UDP_DIAGNOSTICS_REQUEST_CHANNEL,
  REAL_TELEMETRY_CHANNEL, REAL_TELEMETRY_REQUEST_CHANNEL } from '../shared/ipc'
import type { TelemetrySnapshot, TelemetrySource } from '../shared/telemetry'
import type { UdpDiagnosticSnapshot } from '../shared/udp'
import { SimulatedTelemetrySource } from './telemetry/SimulatedTelemetrySource'
import { UdpReceiver } from './udp/UdpReceiver'
import { readUdpPort } from './udp/config'
import { RealTelemetrySource } from './telemetry/RealTelemetrySource'
import type { RealTelemetrySnapshot } from '../shared/realTelemetry'

let mainWindow: BrowserWindow | null = null
let releaseSources: (() => Promise<void>) | undefined
let readyToQuit = false

function createWindow(): void {
  const window = new BrowserWindow({
    title: 'ROSSI PITWALL',
    width: 980,
    height: 660,
    minWidth: 640,
    minHeight: 500,
    show: false,
    backgroundColor: '#0d0f12',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false
    }
  })
  mainWindow = window
  window.setMenu(null)

  const source: TelemetrySource = new SimulatedTelemetrySource()
  const sendSnapshot = (snapshot: TelemetrySnapshot): void => {
    if (!window.isDestroyed() && !window.webContents.isLoadingMainFrame()) {
      window.webContents.send(TELEMETRY_CHANNEL, snapshot)
    }
  }
  const unsubscribe = source.subscribe(sendSnapshot)
  const udp = new UdpReceiver(readUdpPort(process.env.ROSSI_UDP_PORT))
  const sendDiagnostics = (snapshot: UdpDiagnosticSnapshot): void => {
    if (!window.isDestroyed() && !window.webContents.isLoadingMainFrame()) {
      window.webContents.send(UDP_DIAGNOSTICS_CHANNEL, snapshot)
    }
  }
  const unsubscribeUdp = udp.subscribe(sendDiagnostics)
  const requestDiagnostics = (event: IpcMainEvent): void => {
    if (!window.isDestroyed() && event.sender === window.webContents &&
        event.senderFrame === window.webContents.mainFrame) {
      sendDiagnostics(udp.getSnapshot())
    }
  }
  ipcMain.on(UDP_DIAGNOSTICS_REQUEST_CHANNEL, requestDiagnostics)
  const realSource = new RealTelemetrySource(udp)
  const sendRealTelemetry = (snapshot: RealTelemetrySnapshot): void => {
    if (!window.isDestroyed() && !window.webContents.isLoadingMainFrame()) {
      window.webContents.send(REAL_TELEMETRY_CHANNEL, snapshot)
    }
  }
  const unsubscribeReal = realSource.subscribe(sendRealTelemetry)
  const requestRealTelemetry = (event: IpcMainEvent): void => {
    if (!window.isDestroyed() && event.sender === window.webContents &&
        event.senderFrame === window.webContents.mainFrame) {
      sendRealTelemetry(realSource.getSnapshot())
    }
  }
  ipcMain.on(REAL_TELEMETRY_REQUEST_CHANNEL, requestRealTelemetry)
  let shutdown: Promise<void> | undefined
  const cleanup = (): Promise<void> => {
    if (shutdown) return shutdown
    unsubscribe()
    unsubscribeUdp()
    unsubscribeReal()
    ipcMain.removeListener(REAL_TELEMETRY_REQUEST_CHANNEL, requestRealTelemetry)
    realSource.stop()
    ipcMain.removeListener(UDP_DIAGNOSTICS_REQUEST_CHANNEL, requestDiagnostics)
    source.stop()
    shutdown = udp.stop()
    return shutdown
  }
  releaseSources = cleanup
  realSource.start()
  void udp.start()

  window.webContents.on('did-finish-load', () => {
    sendDiagnostics(udp.getSnapshot())
    if (source.getSnapshot().status === 'running') {
      sendSnapshot(source.getSnapshot())
    } else {
      source.start()
    }
  })
  window.once('ready-to-show', () => window.show())
  window.on('closed', () => {
    void cleanup().then(() => {
      if (releaseSources === cleanup) releaseSources = undefined
    })
    mainWindow = null
  })

  // A aplicação só carrega a interface local e não concede permissões a páginas.
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.on('will-attach-webview', (event) => event.preventDefault())
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  window.webContents.session.setPermissionCheckHandler(() => false)

  const devUrl = process.env.ELECTRON_RENDERER_URL
  const loading = !app.isPackaged && devUrl
    ? window.loadURL(devUrl)
    : window.loadFile(join(__dirname, '../renderer/index.html'))
  void loading.catch((error: unknown) => {
    console.error('Não foi possível carregar a interface do ROSSI Pitwall.', error)
    app.quit()
  })
}

void app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (mainWindow === null) createWindow()
  })
})

app.on('before-quit', (event) => {
  if (readyToQuit || !releaseSources) return
  event.preventDefault()
  void releaseSources().then(() => {
    readyToQuit = true
    app.quit()
  })
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
