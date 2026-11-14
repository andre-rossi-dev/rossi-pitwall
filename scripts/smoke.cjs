// Integração real: usa o build de produção e fecha a janela automaticamente.
const { app } = require('electron')
const assert = require('node:assert/strict')
const { join } = require('node:path')
const { setTimeout: delay } = require('node:timers/promises')
const { createSocket } = require('node:dgram')
const { writeFile } = require('node:fs/promises')

const udpMode = process.env.ROSSI_SMOKE_UDP_MODE ?? 'receive'
assert.ok(['receive', 'occupied', 'invalid'].includes(udpMode), 'Modo de smoke UDP desconhecido')
let udpPort
let fixtureSocket

// FIXTURE SINTÉTICA de cabeçalho EA 2026, sem payload. Não é captura do jogo.
// Mesmos offsets documentados em tests/fixtures/f1-header.ts e docs/udp-protocol.md.
function syntheticHeader() {
  const header = Buffer.alloc(29)
  header.writeUInt16LE(2026, 0)
  header[2] = 26
  header[3] = 1
  header[5] = 1
  header[6] = 16
  header.writeBigUInt64LE(123n, 7)
  header.writeFloatLE(10.5, 15)
  header.writeUInt32LE(100, 19)
  header.writeUInt32LE(200, 23)
  header[28] = 255
  return header
}

// Pacotes completos SINTÉTICOS, baseados nos anexos EA. Nunca são captura real.
function syntheticTelemetry(format, id, { session = 123n, speed = 287, gear = 7, lap = 12 } = {}) {
  const cars = format === 2025 ? 22 : 24
  const stride = id === 2 ? 57 : format === 2025 ? 60 : 59
  const packet = Buffer.alloc(29 + cars * stride + (id === 2 ? 2 : 3))
  syntheticHeader().copy(packet)
  packet.writeUInt16LE(format, 0)
  packet[2] = format === 2025 ? 25 : 26
  packet[6] = id
  packet[27] = cars - 1
  packet.writeBigUInt64LE(session, 7)
  for (let car = 0; car < cars; car++) {
    const base = 29 + car * stride
    if (id === 6) {
      packet.writeUInt16LE(car === cars - 1 ? speed : 40, base)
      packet.writeInt8(car === cars - 1 ? gear : 1, base + 15)
    } else {
      packet[base + 32] = car + 1
      packet[base + 33] = car === cars - 1 ? lap : 2
      packet[base + 43] = car + 1
      packet[base + 44] = 4
      packet[base + 45] = 2
      packet[base + 56] = 255
    }
  }
  packet[packet.length - (id === 2 ? 2 : 3)] = 255
  packet[packet.length - (id === 2 ? 1 : 2)] = 255
  return packet
}

async function sendFixture(packet) {
  await new Promise((resolve, reject) => {
    fixtureSocket.send(packet, udpPort, '127.0.0.1', (error) => error ? reject(error) : resolve())
  })
}

const metricEquals = (metric, value) => `document.querySelector('[data-testid="${metric}"]').textContent === ${JSON.stringify(String(value))}`
const selectMode = (window, mode) => window.webContents.executeJavaScript(`document.querySelector('[data-testid="mode-${mode}"]').click()`)

async function waitForUi(window, expression) {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (await window.webContents.executeJavaScript(expression)) return
    await delay(100)
  }
  throw new Error(`Condição não atendida na interface: ${expression}`)
}

app.setPath('userData', join(__dirname, '../.smoke-profile'))
let completed = false
const timeout = setTimeout(() => {
  console.error('SMOKE FALHOU: tempo limite de 40 segundos.')
  app.exit(1)
}, 40_000)

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
      assert.equal(preferences.webviewTag, false)
      await waitForUi(window, `${metricEquals('speed', '—')} && ${metricEquals('gear', '—')} && ${metricEquals('lap', '—')}`)
      await waitForUi(window, `document.querySelector('[data-testid="source-status"]').textContent === 'Aguardando dados'`)
      await selectMode(window, 'simulated')
      await waitForUi(window, `document.querySelector('[data-testid="source-status"]').textContent === 'Fonte ativa'`)

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
      assert.deepEqual(ui.apiKeys, ['onTelemetry', 'onUdpDiagnostics', 'onRealTelemetry'])

      if (udpMode === 'receive') {
        await waitForUi(window, `document.querySelector('[data-testid="udp-status"]').textContent === 'Aguardando datagramas'`)
        await window.webContents.executeJavaScript(`
          window.__smokeCancelUdp = window.pitwall.onUdpDiagnostics((snapshot) => { window.__smokeUdp = snapshot; });
          true;
        `)
        fixtureSocket = createSocket('udp4')
        await new Promise((resolve, reject) => {
          fixtureSocket.send(syntheticHeader(), udpPort, '127.0.0.1', (error) => error ? reject(error) : resolve())
        })
        await waitForUi(window, `window.__smokeUdp?.headers2026 === 1 && document.querySelector('[data-testid="udp-packets"]').textContent === '1'`)
        const diagnostic = await window.webContents.executeJavaScript('window.__smokeUdp')
        assert.equal(diagnostic.bytesReceived, 29)
        assert.equal(diagnostic.lastPacket.packetId, 16)
        assert.equal(diagnostic.lastPacket.packetFormat, 2026)
        assert.equal(diagnostic.status, 'receiving')
        await window.webContents.executeJavaScript('window.__smokeCancelUdp()')
        await selectMode(window, 'udp')
        await waitForUi(window, metricEquals('speed', '—'))
        for (const format of [2025, 2026]) {
          await sendFixture(syntheticTelemetry(format, 2))
          await waitForUi(window, `${metricEquals('lap', 12)} && ${metricEquals('speed', '—')}`)
          await sendFixture(syntheticTelemetry(format, 6, { gear: -1 }))
          await waitForUi(window, `${metricEquals('speed', 287)} && ${metricEquals('gear', 'R')}`)
          await sendFixture(syntheticTelemetry(format, 6, { speed: 0, gear: 0 }))
          await waitForUi(window, `${metricEquals('speed', 0)} && ${metricEquals('gear', 'N')}`)
          await sendFixture(syntheticTelemetry(format, 6, { session: 18446744073709551615n, speed: 301, gear: 8 }))
          await waitForUi(window, `${metricEquals('speed', 301)} && ${metricEquals('gear', 8)} && ${metricEquals('lap', '—')}`)
          await sendFixture(syntheticTelemetry(format, 2, { session: 18446744073709551615n, lap: 3 }))
          await waitForUi(window, metricEquals('lap', 3))
        }
        await window.webContents.executeJavaScript(`
          window.__smokeRealCount = 0;
          window.__smokeCancelReal = window.pitwall.onRealTelemetry(() => { window.__smokeRealCount++; });
          true;
        `)
        await waitForUi(window, 'window.__smokeRealCount > 0')
        await window.webContents.executeJavaScript('window.__smokeCancelReal(); window.__smokeRealCount = 0;')
        // Truncado não deve substituir o último estado nem renovar seu frescor.
        await sendFixture(syntheticTelemetry(2026, 6).subarray(0, 50))
        await delay(200)
        assert.equal(await window.webContents.executeJavaScript('window.__smokeRealCount'), 0)
        assert.equal(await window.webContents.executeJavaScript(metricEquals('speed', 301)), true)
      } else {
        const expectedError = udpMode === 'occupied' ? 'EADDRINUSE' : 'ROSSI_UDP_PORT inválida'
        await waitForUi(window, `document.querySelector('[data-testid="udp-diagnostics"]').textContent.includes(${JSON.stringify(expectedError)})`)
        assert.equal((await readTelemetry()).origin, 'simulated')
      }

      await new Promise((resolve) => {
        window.webContents.once('did-finish-load', resolve)
        window.reload()
      })
      const afterReload = await readTelemetry()
      assert.ok(afterReload.sample.metadata.frameId > second.sample.metadata.frameId)
      if (udpMode === 'receive') {
        await waitForUi(window, `document.querySelector('[data-testid="udp-packets"]').textContent === '12'`)
        await waitForUi(window, `${metricEquals('speed', 301)} && ${metricEquals('lap', 3)}`)
        await waitForUi(window, `document.querySelector('[data-testid="source-status"]').textContent === 'Dados desatualizados'`)
        await waitForUi(window, `${metricEquals('speed', '—')} && ${metricEquals('gear', '—')} && ${metricEquals('lap', '—')}`)
        await waitForUi(window, `document.querySelector('[data-testid="udp-status"]').textContent.includes('Sem datagramas')`)
        await sendFixture(syntheticTelemetry(2026, 6, { session: 18446744073709551615n, speed: 123, gear: 4 }))
        await waitForUi(window, `${metricEquals('speed', 123)} && ${metricEquals('lap', '—')}`)
        await sendFixture(syntheticTelemetry(2026, 2, { session: 18446744073709551615n, lap: 2 }))
        await waitForUi(window, metricEquals('lap', 2))
      }
      const screenshot = await window.webContents.capturePage()
      await writeFile(join(app.getPath('userData'), `udp-${udpMode}.png`), screenshot.toPNG())
      window.setSize(640, 500)
      await waitForUi(window, 'window.innerWidth <= 640')
      await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))')
      assert.equal(await window.webContents.executeJavaScript('document.documentElement.scrollWidth <= window.innerWidth'), true)
      const minimumScreenshot = await window.webContents.capturePage()
      const viewport = await window.webContents.executeJavaScript('({ width: innerWidth, height: innerHeight })')
      assert.deepEqual(minimumScreenshot.getSize(), viewport)
      await writeFile(join(app.getPath('userData'), `udp-${udpMode}-minimum.png`), minimumScreenshot.toPNG())
      await selectMode(window, 'simulated')
      await waitForUi(window, `document.querySelector('[data-testid="source-status"]').textContent === 'Fonte ativa'`)
      assert.deepEqual(errors, [])

      console.log(`SMOKE OK (${udpMode}): Electron → Preload → React, modos real/simulado, diagnóstico UDP, sandbox, recarga e largura mínima verificados.`)
      if (fixtureSocket) await new Promise((resolve) => fixtureSocket.close(resolve))
      completed = true
      clearTimeout(timeout)
      window.close()
    } catch (error) {
      console.error('SMOKE FALHOU:', error)
      console.error(await window.webContents.executeJavaScript('document.body.innerText'))
      clearTimeout(timeout)
      app.exit(1)
    }
  })
})

async function bootstrap() {
  if (udpMode === 'invalid') {
    process.env.ROSSI_UDP_PORT = 'invalid-smoke-fixture'
  } else {
    const reservation = createSocket('udp4')
    await new Promise((resolve, reject) => {
      reservation.once('error', reject)
      reservation.bind(0, '127.0.0.1', resolve)
    })
    udpPort = reservation.address().port
    process.env.ROSSI_UDP_PORT = String(udpPort)
    if (udpMode === 'occupied') fixtureSocket = reservation
    else await new Promise((resolve) => reservation.close(resolve))
  }
  require('../out/main/index.js')
}

void bootstrap().catch((error) => {
  console.error('SMOKE FALHOU na preparação UDP:', error)
  app.exit(1)
})
