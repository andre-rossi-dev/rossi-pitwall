import { createSocket } from 'node:dgram'
import type { Socket, SocketType } from 'node:dgram'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UdpReceiver, DIAGNOSTIC_INTERVAL_MS, UDP_IDLE_MS } from '../src/main/udp/UdpReceiver'
import { syntheticHeader } from './fixtures/f1-header'
import { syntheticTelemetry } from './fixtures/f1-telemetry'
import { syntheticSession } from './fixtures/f1-session'
import { syntheticTyres } from './fixtures/f1-tyres'
import { RealTelemetrySource } from '../src/main/telemetry/RealTelemetrySource'

const { createdSockets } = vi.hoisted(() => ({ createdSockets: [] as Socket[] }))
vi.mock('node:dgram', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:dgram')>()
  return {
    ...actual,
    createSocket: vi.fn((type: SocketType) => {
      const socket = actual.createSocket(type)
      createdSockets.push(socket)
      return socket
    })
  }
})

const receivers: UdpReceiver[] = []
const senders: Socket[] = []
const cancellations: (() => void)[] = []

function receiver(port: number | null = 0): UdpReceiver {
  const source = new UdpReceiver(port)
  receivers.push(source)
  return source
}

function sender(): Socket {
  const socket = createSocket('udp4')
  senders.push(socket)
  return socket
}

async function bind(socket: Socket, port = 0): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    socket.once('error', reject)
    socket.bind(port, '127.0.0.1', () => {
      socket.removeListener('error', reject)
      resolve()
    })
  })
  return socket.address().port
}

async function send(socket: Socket, source: UdpReceiver, buffer: Buffer): Promise<void> {
  const count = source.getSnapshot().packetsReceived
  await new Promise<void>((resolve, reject) => {
    socket.send(buffer, source.getSnapshot().port!, '127.0.0.1', (error) => error ? reject(error) : resolve())
  })
  await vi.waitFor(() => expect(source.getSnapshot().packetsReceived).toBe(count + 1))
}

afterEach(async () => {
  cancellations.splice(0).forEach((cancel) => cancel())
  for (const source of receivers.splice(0)) await source.stop()
  for (const socket of senders.splice(0)) {
    await new Promise<void>((resolve) => {
      try { socket.close(() => resolve()) } catch { resolve() }
    })
  }
  createdSockets.length = 0
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('UdpReceiver com sockets UDP locais e fixtures sintéticas', () => {
  it.each([2025, 2026] as const)('recebe pneus %i no socket existente e encerra sem novas emissões', async (format) => {
    const udp = receiver()
    const real = new RealTelemetrySource(udp)
    real.start()
    try {
      await udp.start()
      const client = sender()
      const player = format === 2025 ? 21 : 23
      await send(client, udp, syntheticTyres(7, { format, player }))
      await send(client, udp, syntheticTyres(10, { format, player }))
      expect(createdSockets).toHaveLength(2) // Receptor único e remetente sintético.
      expect(real.getSnapshot()).toMatchObject({
        tyreStatus: { actualCompound: 18, visualCompound: 16, ageLaps: 8 },
        tyreWear: { frontLeft: 33.75, frontRight: 44, rearLeft: 11.25, rearRight: 22.5 }
      })
      const callback = vi.fn()
      const cancel = real.subscribe(callback)
      cancel()
      callback.mockClear()
      await udp.stop()
      expect(createdSockets[0]!.eventNames()).toEqual([])
      expect(real.getSnapshot()).toMatchObject({ tyreStatus: null, tyreWear: null })
      expect(callback).not.toHaveBeenCalled()
    } finally { real.stop() }
  })
  it('alimenta telemetria e diagnóstico pelo mesmo socket com cancelamentos independentes', async () => {
    const udp = receiver()
    const real = new RealTelemetrySource(udp)
    const callback = vi.fn()
    const cancelFirst = udp.subscribeDatagrams(callback)
    const cancelSecond = udp.subscribeDatagrams(callback)
    cancellations.push(cancelFirst, cancelSecond)
    cancelFirst()
    cancelFirst()
    real.start()
    try {
      await udp.start()
      expect(createdSockets).toHaveLength(1)
      const client = sender()
      await send(client, udp, syntheticTelemetry(6, { format: 2026, player: 23 }))
      await send(client, udp, syntheticTelemetry(2, { format: 2026, player: 23 }))
      expect(real.getSnapshot()).toMatchObject({ motion: { speedKph: 287 }, lap: { number: 12 } })
      expect(udp.getSnapshot()).toMatchObject({ packetsReceived: 2, headers2026: 2, bytesReceived: 2847 })
      expect(callback).toHaveBeenCalledTimes(2)
      await send(client, udp, syntheticSession({ format: 2026, player: 23 }))
      expect(createdSockets).toHaveLength(2) // Um receptor e o remetente da fixture.
      expect(real.getSnapshot()).toMatchObject({ contextStatus: 'identified', context: { sessionType: 1, trackId: 16 } })
      expect(udp.getSnapshot()).toMatchObject({ packetsReceived: 3, headers2026: 3, bytesReceived: 3773 })
      cancelSecond()
      real.stop()
      await send(client, udp, syntheticSession())
      expect(callback).toHaveBeenCalledTimes(3)
      expect(real.getSnapshot()).toMatchObject({ status: 'stopped', motion: null, context: null })
      expect(udp.getSnapshot().packetsReceived).toBe(4)
    } finally { real.stop() }
  })
  it('inicia e encerra de forma idempotente, libera porta e listeners', async () => {
    const source = receiver()
    expect(source.getSnapshot().status).toBe('stopped')
    await Promise.all([source.start(), source.start()])
    expect(source.getSnapshot()).toMatchObject({ status: 'listening', address: '127.0.0.1', packetsReceived: 0 })
    expect(createdSockets).toHaveLength(1)
    const socket = createdSockets[0]!
    const port = source.getSnapshot().port!
    await Promise.all([source.stop(), source.stop()])
    expect(source.getSnapshot().status).toBe('stopped')
    expect(socket.eventNames()).toEqual([])
    expect(() => socket.address()).toThrow()
    expect(await bind(sender(), port)).toBe(port)
  })

  it('serializa parada durante abertura e permite reiniciar sem recursos órfãos', async () => {
    const source = receiver()
    await Promise.all([source.start(), source.stop(), source.start(), source.stop()])
    expect(createdSockets).toHaveLength(2)
    for (const socket of createdSockets) {
      expect(socket.eventNames()).toEqual([])
      expect(() => socket.address()).toThrow()
    }
    expect(source.getSnapshot().status).toBe('stopped')
  })

  it('conta todos os datagramas/bytes e separa formatos, inválidos e não suportados', async () => {
    const source = receiver()
    await source.start()
    const client = sender()
    const packets = [syntheticHeader(), syntheticHeader(2026, 16), syntheticHeader(2024), Buffer.alloc(3), Buffer.alloc(0)]
    for (const packet of packets) await send(client, source, packet)
    expect(source.getSnapshot()).toMatchObject({
      status: 'receiving', packetsReceived: 5, bytesReceived: 90,
      headers2025: 1, headers2026: 1, unsupportedPackets: 1, invalidPackets: 2,
      lastPacket: { kind: 'invalid' }, lastReceivedAt: expect.any(Number)
    })
    // Um datagrama malformado não impede a recepção seguinte.
    const invalid = syntheticHeader(2025, 255)
    await send(client, source, invalid)
    await send(client, source, syntheticHeader())
    expect(source.getSnapshot()).toMatchObject({ packetsReceived: 7, invalidPackets: 3, headers2025: 2 })
    await source.stop()
    expect(source.getSnapshot().packetsReceived).toBe(7)
    await source.start()
    expect(source.getSnapshot().packetsReceived).toBe(0)
  })

  it('aceita retrocessos de tempo e frame sem descartar datagramas', async () => {
    const source = receiver()
    await source.start()
    const client = sender()
    await send(client, source, syntheticHeader())
    const backwards = syntheticHeader()
    backwards.writeFloatLE(1, 15)
    backwards.writeUInt32LE(2, 19)
    await send(client, source, backwards)
    expect(source.getSnapshot()).toMatchObject({
      packetsReceived: 2, headers2025: 2, lastPacket: { sessionTime: 1, frameId: 2 }
    })
  })

  it('trata EADDRINUSE, libera o socket com erro e consegue tentar novamente', async () => {
    const occupied = sender()
    const port = await bind(occupied)
    const source = receiver(port)
    await source.start()
    expect(source.getSnapshot()).toMatchObject({ status: 'error', packetsReceived: 0 })
    expect(source.getSnapshot().error).toContain('EADDRINUSE')
    expect(createdSockets[1]!.eventNames()).toEqual([])
    await new Promise<void>((resolve) => occupied.close(() => resolve()))
    await source.start()
    expect(source.getSnapshot()).toMatchObject({ status: 'listening', error: null })
  })

  it('expõe erro de configuração sem criar socket', async () => {
    const source = receiver(null)
    await source.start()
    expect(source.getSnapshot().status).toBe('error')
    expect(source.getSnapshot().error).toContain('ROSSI_UDP_PORT')
    expect(createdSockets).toHaveLength(0)
  })

  it('encerra recursos em erro de socket após o bind', async () => {
    const source = receiver()
    await source.start()
    const socket = createdSockets[0]!
    socket.emit('error', Object.assign(new Error('fixture de erro de rede'), { code: 'ENETDOWN' }))
    expect(source.getSnapshot().error).toContain('ENETDOWN')
    await vi.waitFor(() => expect(socket.eventNames()).toEqual([]))
    expect(source.getSnapshot().status).toBe('error')
    await source.stop()
  })

  it('limita notificações, detecta silêncio, retoma recepção e cancela timer/inscrições', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance', 'Date'] })
    const source = receiver()
    const callback = vi.fn()
    const cancelFirst = source.subscribe(callback)
    const cancelSecond = source.subscribe(callback)
    cancellations.push(cancelFirst, cancelSecond)
    cancelFirst()
    cancelFirst()
    await source.start()
    const client = sender()
    callback.mockClear()
    await send(client, source, syntheticHeader())
    await send(client, source, syntheticHeader(2026))
    expect(callback).not.toHaveBeenCalled()
    vi.advanceTimersByTime(DIAGNOSTIC_INTERVAL_MS)
    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenLastCalledWith(expect.objectContaining({ packetsReceived: 2, status: 'receiving' }))
    vi.advanceTimersByTime(UDP_IDLE_MS)
    expect(source.getSnapshot().status).toBe('idle')
    await send(client, source, syntheticHeader())
    expect(source.getSnapshot().status).toBe('receiving')
    expect(Object.isFrozen(source.getSnapshot())).toBe(true)
    expect(Object.isFrozen(source.getSnapshot().lastPacket)).toBe(true)
    await source.stop()
    expect(vi.getTimerCount()).toBe(0)
    callback.mockClear()
    vi.advanceTimersByTime(10_000)
    expect(callback).not.toHaveBeenCalled()
    cancelSecond()
    await source.start()
    expect(callback).not.toHaveBeenCalled()
  })
})
