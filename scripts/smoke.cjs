// Integração real: usa o build de produção e fecha a janela automaticamente.
const { app } = require('electron')
const assert = require('node:assert/strict')
const { join } = require('node:path')
const { setTimeout: delay } = require('node:timers/promises')

app.setPath('userData', join(__dirname, '../.smoke-profile'))
let completed = false
const timeout = setTimeout(() => {
  console.error('SMOKE FALHOU: tempo limite de 20 segundos.')
  app.exit(1)
}, 20_000)

app.on('window-all-closed', () => {
  if (!completed) {
    console.error('SMOKE FALHOU: janela encerrada antes da verificação.')
    app.exit(1)
  }
})

app.once('browser-window-created', (_event, window) => {
  const errors = []
  window.webContents.on('preload-error', (_event, _path, error) => errors.push(String(error)))
  window.webContents.on('console-message', (details) => {
    if (details.level === 'error') errors.push(details.message)
  })
  window.webContents.once('did-finish-load', async () => {
    try {
      const preferences = window.webContents.getLastWebPreferences()
      assert.equal(preferences.contextIsolation, true)
      assert.equal(preferences.nodeIntegration, false)
      assert.equal(preferences.sandbox, true)

      const readTelemetry = () => window.webContents.executeJavaScript(`
        new Promise((resolve, reject) => {
          const timer = setTimeout(() => { unsubscribe(); reject(new Error('Sem telemetria')); }, 3000);
          const unsubscribe = window.pitwall.onTelemetry((snapshot) => {
            if (!snapshot.sample) return;
            clearTimeout(timer);
            unsubscribe();
            resolve(snapshot);
          });
        })
      `)
      const first = await readTelemetry()
      await delay(1500)
      const second = await readTelemetry()
      assert.equal(second.origin, 'simulated')
      assert.equal(second.status, 'running')
      assert.ok(second.sample.metadata.frameId > first.sample.metadata.frameId)
      assert.notEqual(second.sample.speedKph, first.sample.speedKph)

      const ui = await window.webContents.executeJavaScript(`({
        title: document.title,
        text: document.body.innerText,
        speed: Number(document.querySelector('[data-testid="speed"]').textContent),
        gear: Number(document.querySelector('[data-testid="gear"]').textContent),
        lap: Number(document.querySelector('[data-testid="lap"]').textContent),
        nodeAccess: typeof window.require,
        apiKeys: Object.keys(window.pitwall)
      })`)
      assert.equal(ui.title, 'ROSSI PITWALL')
      assert.ok(ui.text.includes('SIMULAÇÃO'))
      assert.ok(ui.text.includes('Fonte ativa'))
      assert.ok(ui.speed >= 80 && ui.speed <= 320)
      assert.ok(ui.gear >= 1 && ui.gear <= 8)
      assert.equal(ui.lap, 1)
      assert.equal(ui.nodeAccess, 'undefined')
      assert.deepEqual(ui.apiKeys, ['onTelemetry'])

      await new Promise((resolve) => {
        window.webContents.once('did-finish-load', resolve)
        window.reload()
      })
      const afterReload = await readTelemetry()
      assert.ok(afterReload.sample.metadata.frameId > second.sample.metadata.frameId)
      assert.deepEqual(errors, [])

      console.log('SMOKE OK: Electron → Preload → React, dados contínuos, sandbox e recarga verificados.')
      console.log(JSON.stringify({ first: first.sample, second: second.sample, ui }, null, 2))
      completed = true
      clearTimeout(timeout)
      window.close()
    } catch (error) {
      console.error('SMOKE FALHOU:', error)
      clearTimeout(timeout)
      app.exit(1)
    }
  })
})

require('../out/main/index.js')
