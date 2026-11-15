import { useEffect, useState } from 'react'
import type { TelemetrySnapshot } from '../../shared/telemetry'
import type { RealTelemetrySnapshot } from '../../shared/realTelemetry'
import { SESSION_TYPES, TRACKS } from '../../shared/sessionContext'
import { UdpDiagnostics } from './UdpDiagnostics'
import { TyrePanel } from './TyrePanel'
import { FuelErsPanels } from './FuelErsPanels'

export function App() {
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot | null>(null)
  const [real, setReal] = useState<RealTelemetrySnapshot | null>(null)
  const [mode, setMode] = useState<'udp' | 'simulated'>('udp')

  useEffect(() => {
    // React executa o retorno ao desmontar, inclusive no ciclo extra do StrictMode.
    return window.pitwall.onTelemetry(setTelemetry)
  }, [])
  useEffect(() => window.pitwall.onRealTelemetry(setReal), [])

  const simulated = mode === 'simulated'
  const speed = simulated ? telemetry?.sample?.speedKph : real?.motion?.speedKph
  const gear = simulated ? telemetry?.sample?.gear : real?.motion?.gear
  const lap = simulated ? telemetry?.sample?.lap : real?.lap?.number
  const running = simulated ? telemetry?.status === 'running' : real?.status === 'receiving'
  const status = simulated
    ? telemetry === null ? 'Aguardando dados' : running ? 'Fonte ativa' : 'Fonte parada'
    : real?.status === 'stale' ? 'Dados desatualizados'
      : running ? real?.motion && real.lap ? 'Recebendo dados' : 'Recebendo dados · parcial'
        : 'Aguardando dados'

  return (
    <main className="pitwall">
      <header className="header">
        <div>
          <p className="eyebrow">ENGENHEIRO DE CORRIDA · V0.3B</p>
          <h1>ROSSI <span>PITWALL</span></h1>
        </div>
        <span className="simulation-badge">{simulated ? 'SIMULAÇÃO' : 'UDP REAL'}</span>
      </header>

      <div className="mode-selector" role="group" aria-label="Modalidade de telemetria">
        <button type="button" data-testid="mode-udp" aria-pressed={!simulated} onClick={() => setMode('udp')}>UDP REAL</button>
        <button type="button" data-testid="mode-simulated" aria-pressed={simulated} onClick={() => setMode('simulated')}>SIMULAÇÃO</button>
      </div>

      <section className="telemetry-panel" aria-labelledby="telemetry-title">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">TELEMETRIA LOCAL</p>
            <h2 id="telemetry-title">{simulated ? 'Na pista, em modo simulado.' : 'Telemetria recebida via UDP.'}</h2>
          </div>
          <p className={`source-status ${running ? 'is-running' : ''}`} role="status">
            <span className="status-dot" aria-hidden="true" />
            <span data-testid="source-status">{status}</span>
          </p>
        </div>

        <dl className="metrics">
          <div className="metric speed">
            <dt>VELOCIDADE</dt>
            <dd><span data-testid="speed">{speed ?? '—'}</span><small>km/h</small></dd>
          </div>
          <div className="metric">
            <dt>MARCHA</dt>
            <dd data-testid="gear">{gear === -1 ? 'R' : gear === 0 ? 'N' : gear ?? '—'}</dd>
          </div>
          <div className="metric">
            <dt>VOLTA</dt>
            <dd data-testid="lap">{lap ?? '—'}</dd>
          </div>
        </dl>

        {!simulated && (
          <p className="session-context" data-testid="session-context">
            {real?.context
              ? `${real.context.sessionType === null ? 'Sessão desconhecida' : SESSION_TYPES[real.context.sessionType]} · ${real.context.trackId === null ? 'Circuito desconhecido' : TRACKS[real.context.trackId]}`
              : real?.contextStatus === 'unavailable' ? 'Contexto da sessão indisponível' : 'Aguardando contexto da sessão'}
          </p>
        )}

        <div className="panel-footer">
          <span>Fonte: {simulated ? 'simulador local' : `UDP${real?.identity ? ` ${real.identity.packetFormat} · carro ${real.identity.playerCarIndex}` : ''}`}</span>
          <span>{simulated ? 'Velocidade, marcha e volta fictícias' : '— indica dado ausente ou desatualizado'}</span>
        </div>
      </section>

      {!simulated && <TyrePanel snapshot={real} />}
      {!simulated && <FuelErsPanels snapshot={real} />}

      <UdpDiagnostics />

      <footer className="footer">
        <span>F1 25 <span className="separator">/</span> TEMPORADA 2026</span>
        <span>TELEMETRIA E DIAGNÓSTICO</span>
      </footer>
    </main>
  )
}
