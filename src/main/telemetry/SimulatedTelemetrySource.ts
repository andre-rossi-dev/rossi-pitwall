import type {
  TelemetryListener,
  TelemetrySample,
  TelemetrySnapshot,
  TelemetrySource,
  Unsubscribe
} from '../../shared/telemetry'

export const SAMPLE_INTERVAL_MS = 250
const LAP_DURATION_SECONDS = 60

export class SimulatedTelemetrySource implements TelemetrySource {
  private timer: ReturnType<typeof setInterval> | undefined
  private readonly listeners = new Set<TelemetryListener>()
  private frameId = 0
  private snapshot: TelemetrySnapshot = Object.freeze({
    origin: 'simulated', status: 'stopped', sample: null
  })

  getSnapshot(): TelemetrySnapshot {
    return this.snapshot
  }

  start(): void {
    if (this.timer !== undefined) return

    this.frameId = 0
    this.timer = setInterval(() => this.emitSample(), SAMPLE_INTERVAL_MS)
    this.emitSample()
  }

  stop(): void {
    if (this.timer === undefined) return

    clearInterval(this.timer)
    this.timer = undefined
    // Uma última notificação informa a parada; nenhuma amostra é gerada depois.
    this.publish(Object.freeze({ ...this.snapshot, status: 'stopped' }))
  }

  subscribe(listener: TelemetryListener): Unsubscribe {
    // Cada inscrição tem seu próprio cancelamento, mesmo com callbacks iguais.
    const subscription: TelemetryListener = (snapshot) => listener(snapshot)
    this.listeners.add(subscription)
    subscription(this.snapshot)
    return () => { this.listeners.delete(subscription) }
  }

  private emitSample(): void {
    const sessionTimeSeconds = this.frameId * SAMPLE_INTERVAL_MS / 1000
    const progress = (sessionTimeSeconds % LAP_DURATION_SECONDS) / LAP_DURATION_SECONDS
    const speedKph = Math.round(80 + 240 * (1 - Math.cos(progress * 2 * Math.PI)) / 2)
    const sample: TelemetrySample = Object.freeze({
      metadata: Object.freeze({
        sessionId: 'simulation-v0.1',
        frameId: this.frameId,
        sessionTimeSeconds,
        origin: 'simulated',
        protocolVersion: null
      }),
      speedKph,
      gear: Math.min(8, Math.max(1, Math.ceil(speedKph / 40))),
      lap: Math.floor(sessionTimeSeconds / LAP_DURATION_SECONDS) + 1
    })

    this.frameId += 1
    this.publish(Object.freeze({ origin: 'simulated', status: 'running', sample }))
  }

  private publish(snapshot: TelemetrySnapshot): void {
    this.snapshot = snapshot
    this.listeners.forEach((listener) => listener(snapshot))
  }
}
