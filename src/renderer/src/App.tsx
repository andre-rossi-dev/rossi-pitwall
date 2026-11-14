import { useEffect, useState } from 'react'
import type { TelemetrySnapshot } from '../../shared/telemetry'
import { UdpDiagnostics } from './UdpDiagnostics'

export function App() {
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot | null>(null)

  useEffect(() => {
    // React executa o retorno ao desmontar, inclusive no ciclo extra do StrictMode.
    return window.pitwall.onTelemetry(setTelemetry)
  }, [])

  const sample = telemetry?.sample
  const running = telemetry?.status === 'running'
  const status = telemetry === null ? 'Aguardando dados' : running ? 'Fonte ativa' : 'Fonte parada'

  return (
    <main className="pitwall">
      <header className="header">
        <div>
          <p className="eyebrow">ENGENHEIRO DE CORRIDA · V0.2A</p>
          <h1>ROSSI <span>PITWALL</span></h1>
        </div>
        <span className="simulation-badge">SIMULAÇÃO</span>
      </header>

      <section className="telemetry-panel" aria-labelledby="telemetry-title">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">TELEMETRIA LOCAL</p>
            <h2 id="telemetry-title">Na pista, em modo simulado.</h2>
          </div>
          <p className={`source-status ${running ? 'is-running' : ''}`} role="status">
            <span className="status-dot" aria-hidden="true" />
            <span data-testid="source-status">{status}</span>
          </p>
        </div>

        <dl className="metrics">
          <div className="metric speed">
            <dt>VELOCIDADE</dt>
            <dd><span data-testid="speed">{sample?.speedKph ?? '—'}</span><small>km/h</small></dd>
          </div>
          <div className="metric">
            <dt>MARCHA</dt>
            <dd data-testid="gear">{sample?.gear ?? '—'}</dd>
          </div>
          <div className="metric">
            <dt>VOLTA</dt>
            <dd data-testid="lap">{sample?.lap ?? '—'}</dd>
          </div>
        </dl>

        <div className="panel-footer">
          <span>Fonte: {telemetry?.origin === 'simulated' ? 'simulador local' : 'aguardando'}</span>
          <span>Velocidade, marcha e volta fictícias</span>
        </div>
      </section>

      <UdpDiagnostics />

      <footer className="footer">
        <span>F1 25 <span className="separator">/</span> TEMPORADA 2026</span>
        <span>RECEPÇÃO E DIAGNÓSTICO</span>
      </footer>
    </main>
  )
}
