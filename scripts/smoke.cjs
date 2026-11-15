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
let sentFixtures = 0

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
function syntheticTelemetry(format, id, {
  session = 123n, speed = 287, gear = 7, lap = 12,
  frame = 100, overallFrame = 200, time = 10.5
} = {}) {
  const cars = format === 2025 ? 22 : 24
  const stride = id === 2 ? 57 : format === 2025 ? 60 : 59
  const packet = Buffer.alloc(29 + cars * stride + (id === 2 ? 2 : 3))
  syntheticHeader().copy(packet)
  packet.writeUInt16LE(format, 0)
  packet[2] = format === 2025 ? 25 : 26
  packet[6] = id
  packet[27] = cars - 1
  packet.writeBigUInt64LE(session, 7)
  packet.writeFloatLE(time, 15)
  packet.writeUInt32LE(frame, 19)
  packet.writeUInt32LE(overallFrame, 23)
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

// Session Data SINTÉTICO, packed EA, sem constantes importadas do decoder.
function syntheticSession(format, {
  session = 123n, overallFrame = 200, sessionType = 1, trackId = 16,
  seasonLink = 10, weekendLink = 20, sessionLink = 30
} = {}) {
  const packet = Buffer.alloc(format === 2025 ? 753 : 926)
  syntheticHeader().copy(packet)
  packet.writeUInt16LE(format, 0)
  packet[6] = 1
  packet[27] = format === 2025 ? 21 : 23
  packet.writeBigUInt64LE(session, 7)
  packet.writeUInt32LE(overallFrame, 23)
  packet[35] = sessionType
  packet.writeInt8(trackId, 36)
  packet.writeUInt32LE(seasonLink, 670)
  packet.writeUInt32LE(weekendLink, 674)
  packet.writeUInt32LE(sessionLink, 678)
  return packet
}

// Pneus SINTÉTICOS completos, independentes do parser; ordem TE, TD, FE, FD.
function syntheticTyres(format, id, {
  session = 123n, overallFrame = 200, frame = 100, time = 10.5,
  actual = 18, visual = 16, age = 8, wear = [11.25, 22.5, 33.75, 44]
} = {}) {
  const cars = format === 2025 ? 22 : 24
  const stride = id === 7 ? (format === 2025 ? 55 : 59) : 46
  const packet = Buffer.alloc(29 + cars * stride)
  syntheticHeader().copy(packet)
  packet.writeUInt16LE(format, 0)
  packet[6] = id
  packet[27] = cars - 1
  packet.writeBigUInt64LE(session, 7)
  packet.writeUInt32LE(overallFrame, 23)
  packet.writeUInt32LE(frame, 19)
  packet.writeFloatLE(time, 15)
  for (let car = 0; car < cars; car++) {
    const base = 29 + car * stride
    if (id === 7) {
      packet[base + 25] = car === cars - 1 ? actual : 20
      packet[base + 26] = car === cars - 1 ? visual : 18
      packet[base + 27] = car === cars - 1 ? age : 1
    } else {
      for (let wheel = 0; wheel < 4; wheel++) {
        packet.writeFloatLE(car === cars - 1 ? wear[wheel] : car + wheel, base + wheel * 4)
        packet[base + 16 + wheel] = 91 + wheel
      }
    }
  }
  return packet
}

async function sendFixture(packet) {
  await new Promise((resolve, reject) => {
    fixtureSocket.send(packet, udpPort, '127.0.0.1', (error) => error ? reject(error) : resolve())
  })
  sentFixtures++
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

async function capturePage(window, stage) {
  try {
    console.log(`SMOKE captura (${udpMode}, ${stage}): visível=${window.isVisible()}, minimizada=${window.isMinimized()}`)
    // Este teste é gráfico: garante uma janela exibida antes de aguardar frames.
    if (window.isMinimized()) window.restore()
    window.show()
    // Após recarga, DOM pronto não implica que o compositor já produziu frames.
    await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))')
    return await window.webContents.capturePage()
  } catch (cause) {
    // Mantém a falha visível e identifica a etapa, sem retry que a esconda.
    throw new Error(`Falha na captura gráfica (${udpMode}, ${stage})`, { cause })
  }
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
      await waitForUi(window, metricEquals('session-context', 'Aguardando contexto da sessão'))
      await waitForUi(window, `${metricEquals('tyre-age', '—')} && ${metricEquals('tyre-frontLeft', '—')}`)
      await selectMode(window, 'simulated')
      await waitForUi(window, `document.querySelector('[data-testid="source-status"]').textContent === 'Fonte ativa'`)
      assert.equal(await window.webContents.executeJavaScript('document.querySelector(\'[data-testid="session-context"]\') === null'), true)

      const readReal = () => window.webContents.executeJavaScript(`
        new Promise((resolve, reject) => {
          const timer = setTimeout(() => { unsubscribe(); reject(new Error('Sem snapshot real')); }, 3000);
          const unsubscribe = window.pitwall.onRealTelemetry((snapshot) => {
            clearTimeout(timer);
            unsubscribe();
            resolve(snapshot);
          });
        })
      `)
      let beforeReloadReal

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
      assert.equal(await window.webContents.executeJavaScript('document.querySelector(\'[data-testid="tyre-panel"]\') === null'), true)
      assert.deepEqual(ui.apiKeys, ['onTelemetry', 'onUdpDiagnostics', 'onRealTelemetry'])

      if (udpMode === 'receive') {
        await waitForUi(window, `document.querySelector('[data-testid="udp-status"]').textContent === 'Aguardando datagramas'`)
        await window.webContents.executeJavaScript(`
          window.__smokeCancelUdp = window.pitwall.onUdpDiagnostics((snapshot) => { window.__smokeUdp = snapshot; });
          true;
        `)
        fixtureSocket = createSocket('udp4')
        await sendFixture(syntheticHeader())
        await waitForUi(window, `window.__smokeUdp?.headers2026 === 1 && document.querySelector('[data-testid="udp-packets"]').textContent === '1'`)
        const diagnostic = await window.webContents.executeJavaScript('window.__smokeUdp')
        assert.equal(diagnostic.bytesReceived, 29)
        assert.equal(diagnostic.lastPacket.packetId, 16)
        assert.equal(diagnostic.lastPacket.packetFormat, 2026)
        assert.equal(diagnostic.status, 'receiving')
        await window.webContents.executeJavaScript('window.__smokeCancelUdp()')
        await selectMode(window, 'udp')
        await waitForUi(window, metricEquals('speed', '—'))
        const waitForAllPackets = () => waitForUi(window, metricEquals('udp-packets', sentFixtures))
        // Ida e volta de formato com o mesmo UID; cada mudança exige confirmação.
        for (const format of [2025, 2026, 2025, 2026]) {
          await sendFixture(syntheticTelemetry(format, 2))
          await sendFixture(syntheticTelemetry(format, 2, { overallFrame: 201 }))
          await waitForUi(window, `${metricEquals('lap', 12)} && ${metricEquals('speed', '—')}`)
          await waitForUi(window, metricEquals('session-context', 'Aguardando contexto da sessão'))
          await waitForUi(window, `${metricEquals('tyre-age', '—')} && ${metricEquals('tyre-frontLeft', '—')}`)
          await sendFixture(syntheticTyres(format, 7))
          await waitForUi(window, `${metricEquals('tyre-visual', 'Macio')} && ${metricEquals('tyre-actual', 'C3')} && ${metricEquals('tyre-age', 8)} && ${metricEquals('tyre-frontLeft', '—')}`)
          await sendFixture(syntheticTyres(format, 10, { overallFrame: 50 }))
          await waitForUi(window, `${metricEquals('tyre-frontLeft', '33,8%')} && ${metricEquals('tyre-frontRight', '44%')} && ${metricEquals('tyre-rearLeft', '11,3%')} && ${metricEquals('tyre-rearRight', '22,5%')}`)
          await sendFixture(syntheticTyres(format, 7, { age: 99 })) // Duplicata.
          await sendFixture(syntheticTyres(format, 10, { overallFrame: 49, wear: [99, 99, 99, 99] }))
          await waitForAllPackets()
          assert.equal(await window.webContents.executeJavaScript(metricEquals('tyre-age', 8)), true)
          assert.equal(await window.webContents.executeJavaScript(metricEquals('tyre-frontLeft', '33,8%')), true)
          await sendFixture(syntheticTyres(format, 7, { overallFrame: 201, frame: 1, time: 0.5, age: 0 }))
          await sendFixture(syntheticTyres(format, 10, { overallFrame: 51, frame: 2, time: 1, wear: [0, 1, 2, 3] }))
          await waitForUi(window, `${metricEquals('tyre-age', 0)} && ${metricEquals('tyre-frontLeft', '2%')}`)
          // Troca de pneus sintética: tempo/frame avançam, composto muda e desgaste diminui.
          await sendFixture(syntheticTyres(format, 7, { overallFrame: 202, frame: 3, time: 2, actual: 20, visual: 18, age: 0 }))
          await sendFixture(syntheticTyres(format, 10, { overallFrame: 52, frame: 4, time: 2.5, wear: [0, 0, 0, 0] }))
          await waitForUi(window, `${metricEquals('tyre-actual', 'C1')} && ${metricEquals('tyre-visual', 'Duro')} && ${metricEquals('tyre-age', 0)} && ${metricEquals('tyre-frontLeft', '0%')} && ${metricEquals('tyre-frontRight', '0%')} && ${metricEquals('tyre-rearLeft', '0%')} && ${metricEquals('tyre-rearRight', '0%')}`)
          await sendFixture(syntheticSession(format))
          await waitForUi(window, metricEquals('session-context', 'Treino livre 1 · Brasil'))
          // Duplicata conflitante e contexto antigo não trocam o rótulo.
          await sendFixture(syntheticSession(format, { sessionType: 15 }))
          await sendFixture(syntheticSession(format, { overallFrame: 199, trackId: 0 }))
          await waitForAllPackets()
          assert.equal(await window.webContents.executeJavaScript(metricEquals('session-context', 'Treino livre 1 · Brasil')), true)
          await sendFixture(syntheticTelemetry(format, 6, { gear: -1 }))
          await waitForUi(window, `${metricEquals('speed', 287)} && ${metricEquals('gear', 'R')}`)
          await sendFixture(syntheticTelemetry(format, 6, { overallFrame: 201, speed: 0, gear: 0 }))
          await waitForUi(window, `${metricEquals('speed', 0)} && ${metricEquals('gear', 'N')}`)
          // Duplicata conflitante e atraso não substituem a amostra aceita.
          await sendFixture(syntheticTelemetry(format, 6, { overallFrame: 201, speed: 999 }))
          await sendFixture(syntheticTelemetry(format, 6, { overallFrame: 199, speed: 999 }))
          await waitForAllPackets()
          assert.equal(await window.webContents.executeJavaScript(metricEquals('speed', 0)), true)
          // Flashback sintético: contador geral avança, frame/tempo/volta recuam.
          await sendFixture(syntheticTelemetry(format, 6, { overallFrame: 202, frame: 2, time: 1, speed: 80, gear: 2 }))
          await sendFixture(syntheticTelemetry(format, 2, { overallFrame: 202, frame: 1, time: 0.5, lap: 3 }))
          await waitForUi(window, `${metricEquals('speed', 80)} && ${metricEquals('lap', 3)}`)
          await sendFixture(syntheticTelemetry(format, 2, { overallFrame: 201, lap: 12 }))
          await waitForAllPackets()
          assert.equal(await window.webContents.executeJavaScript(metricEquals('lap', 3)), true)
        }
        // Nova sessão inicia com contador menor, sem comparação com a anterior.
        await sendFixture(syntheticTelemetry(2026, 6, { session: 18446744073709551615n, overallFrame: 0, speed: 301, gear: 8 }))
        await waitForAllPackets()
        assert.equal(await window.webContents.executeJavaScript(metricEquals('speed', 80)), true)
        await sendFixture(syntheticTelemetry(2026, 6, { session: 18446744073709551615n, overallFrame: 1, speed: 301, gear: 8 }))
        await waitForUi(window, `${metricEquals('speed', 301)} && ${metricEquals('gear', 8)} && ${metricEquals('lap', '—')}`)
        await waitForUi(window, metricEquals('session-context', 'Aguardando contexto da sessão'))
        await waitForUi(window, `${metricEquals('tyre-age', '—')} && ${metricEquals('tyre-frontLeft', '—')}`)
        await sendFixture(syntheticTyres(2026, 7, { session: 18446744073709551615n, overallFrame: 0 }))
        await sendFixture(syntheticTyres(2026, 10, { session: 18446744073709551615n, overallFrame: 0 }))
        await sendFixture(syntheticSession(2026, { session: 18446744073709551615n, overallFrame: 0, sessionType: 15, sessionLink: 31 }))
        await waitForUi(window, metricEquals('session-context', 'Corrida · Brasil'))
        await sendFixture(syntheticTelemetry(2026, 2, { session: 18446744073709551615n, overallFrame: 0, lap: 3 }))
        await waitForUi(window, metricEquals('lap', 3))
        for (const overallFrame of [500, 501]) await sendFixture(syntheticTelemetry(2025, 6, { overallFrame, speed: 999 }))
        for (const overallFrame of [500, 501]) await sendFixture(syntheticSession(2026, { overallFrame }))
        await waitForAllPackets()
        assert.equal(await window.webContents.executeJavaScript(`${metricEquals('speed', 301)} && ${metricEquals('lap', 3)}`), true)
        assert.equal(await window.webContents.executeJavaScript(metricEquals('session-context', 'Corrida · Brasil')), true)
        await window.webContents.executeJavaScript(`
          window.__smokeRealCount = 0;
          window.__smokeCancelReal = window.pitwall.onRealTelemetry(() => { window.__smokeRealCount++; });
          true;
        `)
        await waitForUi(window, 'window.__smokeRealCount > 0')
        await window.webContents.executeJavaScript('window.__smokeCancelReal(); window.__smokeRealCount = 0;')
        // Truncado não deve substituir o último estado nem renovar seu frescor.
        await sendFixture(syntheticTelemetry(2026, 6).subarray(0, 50))
        await sendFixture(syntheticSession(2026).subarray(0, 700))
        await sendFixture(syntheticSession(2026, { session: 18446744073709551615n, overallFrame: 1, sessionType: 15, sessionLink: 31 }))
        await delay(200)
        assert.equal(await window.webContents.executeJavaScript('window.__smokeRealCount'), 0)
        assert.equal(await window.webContents.executeJavaScript(metricEquals('speed', 301)), true)
        beforeReloadReal = await readReal()
        assert.equal(beforeReloadReal.context.sessionLinkIdentifier, 31)
        assert.equal(beforeReloadReal.context.weekendLinkIdentifier, 20)
        assert.equal(beforeReloadReal.identityRevision, 4)
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
        await waitForUi(window, metricEquals('udp-packets', sentFixtures))
        await waitForUi(window, `${metricEquals('speed', 301)} && ${metricEquals('lap', 3)}`)
        const afterReloadReal = await readReal()
        assert.deepEqual(afterReloadReal.identity, beforeReloadReal.identity)
        assert.deepEqual(afterReloadReal.context, beforeReloadReal.context)
        assert.deepEqual(afterReloadReal.tyreStatus, beforeReloadReal.tyreStatus)
        assert.deepEqual(afterReloadReal.tyreWear, beforeReloadReal.tyreWear)
        assert.equal(afterReloadReal.identityRevision, beforeReloadReal.identityRevision)
        await waitForUi(window, metricEquals('session-context', 'Corrida · Brasil'))
        await waitForUi(window, `document.querySelector('[data-testid="source-status"]').textContent === 'Dados desatualizados'`)
        await waitForUi(window, `${metricEquals('speed', '—')} && ${metricEquals('gear', '—')} && ${metricEquals('lap', '—')}`)
        await waitForUi(window, `document.querySelector('[data-testid="udp-status"]').textContent.includes('Sem datagramas')`)
        await waitForUi(window, metricEquals('session-context', 'Contexto da sessão indisponível'))
        await waitForUi(window, `${metricEquals('tyre-age', '—')} && ${metricEquals('tyre-frontLeft', '—')}`)
        await sendFixture(syntheticTyres(2026, 7, { session: 18446744073709551615n, overallFrame: 0 }))
        await sendFixture(syntheticTyres(2026, 10, { session: 18446744073709551615n, overallFrame: 0 }))
        await waitForUi(window, metricEquals('udp-packets', sentFixtures))
        assert.equal(await window.webContents.executeJavaScript(metricEquals('tyre-age', '—')), true)
        await sendFixture(syntheticTyres(2026, 7, { session: 18446744073709551615n, overallFrame: 1, actual: 255, visual: 254, age: 0 }))
        await waitForUi(window, `${metricEquals('tyre-actual', 'Desconhecido (255)')} && ${metricEquals('tyre-visual', 'Desconhecido (254)')} && ${metricEquals('tyre-age', 0)} && ${metricEquals('tyre-frontLeft', '—')}`)
        await sendFixture(syntheticTyres(2026, 10, { session: 18446744073709551615n, overallFrame: 1, wear: [0, 100, 1.5, 2.5] }))
        await waitForUi(window, `${metricEquals('tyre-frontLeft', '1,5%')} && ${metricEquals('tyre-rearRight', '100%')}`)
        await sendFixture(syntheticSession(2026, { session: 18446744073709551615n, overallFrame: 1, sessionType: 15, sessionLink: 31 }))
        // Uma duplicação após silêncio mantém os dados vencidos.
        await sendFixture(syntheticTelemetry(2026, 6, { session: 18446744073709551615n, overallFrame: 1, speed: 301, gear: 8 }))
        await waitForUi(window, metricEquals('udp-packets', sentFixtures))
        assert.equal(await window.webContents.executeJavaScript(metricEquals('speed', '—')), true)
        assert.equal(await window.webContents.executeJavaScript(metricEquals('session-context', 'Contexto da sessão indisponível')), true)
        await sendFixture(syntheticSession(2026, { session: 18446744073709551615n, overallFrame: 2, sessionType: 15, sessionLink: 31 }))
        await waitForUi(window, metricEquals('session-context', 'Corrida · Brasil'))
        await sendFixture(syntheticTelemetry(2026, 6, { session: 18446744073709551615n, overallFrame: 2, speed: 123, gear: 4 }))
        await waitForUi(window, `${metricEquals('speed', 123)} && ${metricEquals('lap', '—')}`)
        await sendFixture(syntheticTelemetry(2026, 2, { session: 18446744073709551615n, overallFrame: 1, lap: 2 }))
        await waitForUi(window, metricEquals('lap', 2))
        // Vínculo contraditório sob o mesmo UID não recebe rótulo atual.
        await sendFixture(syntheticSession(2026, { session: 18446744073709551615n, overallFrame: 3, sessionType: 15, sessionLink: 999 }))
        await waitForUi(window, metricEquals('session-context', 'Contexto da sessão indisponível'))
        assert.equal(await window.webContents.executeJavaScript(metricEquals('speed', 123)), true)
        // Novo fim de semana e depois retomada com UID novo e mesmos vínculos.
        for (const session of [456n, 789n]) {
          for (const overallFrame of [0, 1]) {
            await sendFixture(syntheticSession(2026, { session, overallFrame, sessionType: 14, trackId: 42, weekendLink: 21, sessionLink: 32 }))
          }
          await waitForUi(window, metricEquals('udp-packets', sentFixtures))
          await waitForUi(window, metricEquals('session-context', 'Classificação sprint de volta única · Madrid'))
          const current = await readReal()
          assert.equal(current.identity.sessionId, String(session))
          assert.equal(current.context.weekendLinkIdentifier, 21)
          assert.equal(current.context.sessionLinkIdentifier, 32)
          assert.equal(current.motion, null)
          assert.equal(current.lap, null)
          assert.equal(current.tyreStatus, null)
          assert.equal(current.tyreWear, null)
        }
        // Rajada do UID aposentado não restaura o contexto anterior após retomada.
        for (const overallFrame of [2, 3]) await sendFixture(syntheticSession(2026, { session: 456n, overallFrame, sessionType: 1 }))
        await waitForUi(window, metricEquals('udp-packets', sentFixtures))
        assert.equal((await readReal()).identity.sessionId, '789')
        await sendFixture(syntheticSession(2026, { session: 789n, overallFrame: 2, sessionType: 0, trackId: -1, weekendLink: 21, sessionLink: 32 }))
        await waitForUi(window, metricEquals('session-context', 'Sessão desconhecida · Circuito desconhecido'))
        await sendFixture(syntheticSession(2026, { session: 789n, overallFrame: 3, sessionType: 14, trackId: 42, weekendLink: 21, sessionLink: 32 }))
        await waitForUi(window, metricEquals('session-context', 'Classificação sprint de volta única · Madrid'))
        await sendFixture(syntheticTyres(2026, 7, { session: 789n }))
        await sendFixture(syntheticTyres(2026, 10, { session: 789n }))
        await waitForUi(window, metricEquals('tyre-frontLeft', '33,8%'))
        // Receber ID 10 novo não renova composto/idade do ID 7.
        await delay(1500)
        await sendFixture(syntheticTyres(2026, 10, { session: 789n, overallFrame: 201 }))
        await waitForUi(window, metricEquals('tyre-age', '—'))
        assert.equal(await window.webContents.executeJavaScript(metricEquals('tyre-frontLeft', '33,8%')), true)
        assert.equal(await window.webContents.executeJavaScript(metricEquals('tyre-availability', 'Composto/idade: dados desatualizados · Desgaste: disponível')), true)
        await sendFixture(syntheticTyres(2026, 7, { session: 789n, overallFrame: 201 }))
        await waitForUi(window, metricEquals('tyre-age', 8))
      }
      const screenshot = await capturePage(window, 'tamanho inicial')
      await writeFile(join(app.getPath('userData'), `udp-${udpMode}.png`), screenshot.toPNG())
      window.setSize(640, 500)
      await waitForUi(window, 'window.innerWidth <= 640')
      assert.equal(await window.webContents.executeJavaScript('document.documentElement.scrollWidth <= window.innerWidth'), true)
      const minimumScreenshot = await capturePage(window, 'tamanho mínimo')
      const viewport = await window.webContents.executeJavaScript('({ width: innerWidth, height: innerHeight })')
      assert.deepEqual(minimumScreenshot.getSize(), viewport)
      await writeFile(join(app.getPath('userData'), `udp-${udpMode}-minimum.png`), minimumScreenshot.toPNG())
      if (udpMode === 'receive') {
        // O painel fica abaixo dos indicadores: verificar também a região após rolagem.
        for (const [width, height, label] of [[980, 660, 'initial'], [640, 500, 'minimum']]) {
          window.setSize(width, height)
          await waitForUi(window, width > 720 ? 'window.innerWidth > 720' : 'window.innerWidth <= 640')
          const overallFrame = label === 'initial' ? 300 : 301
          await sendFixture(syntheticTyres(2026, 7, { session: 789n, overallFrame, actual: 255, visual: 254 }))
          await sendFixture(syntheticTyres(2026, 10, { session: 789n, overallFrame }))
          await waitForUi(window, metricEquals('tyre-actual', 'Desconhecido (255)'))
          await window.webContents.executeJavaScript('document.querySelector(\'[data-testid="tyre-panel"]\').scrollIntoView({ block: "center" })')
          const tyresScreenshot = await capturePage(window, `painel pneus ${label}`)
          assert.equal(await window.webContents.executeJavaScript(`(() => {
            const panel = document.querySelector('[data-testid="tyre-panel"]');
            const bounds = panel.getBoundingClientRect();
            return bounds.top >= 0 && bounds.bottom <= innerHeight &&
              document.documentElement.scrollWidth <= innerWidth &&
              [...panel.querySelectorAll('dd')].every(field => field.scrollWidth <= field.clientWidth);
          })()`), true)
          await writeFile(join(app.getPath('userData'), `tyres-${label}.png`), tyresScreenshot.toPNG())
        }
      }
      await selectMode(window, 'simulated')
      await waitForUi(window, `document.querySelector('[data-testid="source-status"]').textContent === 'Fonte ativa'`)
      assert.equal(await window.webContents.executeJavaScript('document.querySelector(\'[data-testid="tyre-panel"]\') === null'), true)
      assert.equal(await window.webContents.executeJavaScript('document.querySelector(\'[data-testid="session-context"]\') === null'), true)
      assert.deepEqual(errors, [])

      console.log(`SMOKE OK (${udpMode}): Electron → Preload → React, modos real/simulado, diagnóstico UDP, sandbox, recarga e largura mínima verificados.`)
      if (fixtureSocket) await new Promise((resolve) => fixtureSocket.close(resolve))
      completed = true
      clearTimeout(timeout)
      window.close()
    } catch (error) {
      console.error('SMOKE FALHOU:', error)
      try {
        if (!window.isDestroyed()) console.error(await window.webContents.executeJavaScript('document.body.innerText'))
      } catch (diagnosticError) {
        console.error('Não foi possível ler a interface após a falha:', diagnosticError)
      }
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
