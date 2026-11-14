import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { TELEMETRY_CHANNEL } from '../shared/ipc'
import type { TelemetrySnapshot, TelemetrySource } from '../shared/telemetry'
import { SimulatedTelemetrySource } from './telemetry/SimulatedTelemetrySource'

let mainWindow: BrowserWindow | null = null
let releaseTelemetry: (() => void) | undefined

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
  const cleanup = (): void => {
    unsubscribe()
    source.stop()
  }
  releaseTelemetry = cleanup

  window.webContents.on('did-finish-load', () => {
    if (source.getSnapshot().status === 'running') {
      sendSnapshot(source.getSnapshot())
    } else {
      source.start()
    }
  })
  window.once('ready-to-show', () => window.show())
  window.on('closed', () => {
    cleanup()
    releaseTelemetry = undefined
    mainWindow = null
  })

  // A V0.1 só carrega a interface local e não concede permissões a páginas.
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

app.on('before-quit', () => releaseTelemetry?.())
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
