import type { DataFreshness, RealTelemetrySnapshot } from '../../shared/realTelemetry'
import { ersDeployModeLabel } from '../../shared/ers'

const availability: Record<DataFreshness, string> = {
  waiting: 'Aguardando dados', fresh: 'Dados recebidos', stale: 'Dados desatualizados'
}
const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })
const energy = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 })

function quantity(value: number | null | undefined, unit: string): string {
  return value == null ? '—' : `${decimal.format(value)} ${unit}`
}

function megajoules(value: number | null | undefined): string {
  // Somente apresentação: o snapshot conserva J; 1 MJ = 1.000.000 J.
  return value == null ? '—' : `${energy.format(value / 1_000_000)} MJ`
}

export function FuelErsPanels({ snapshot }: { readonly snapshot: RealTelemetrySnapshot | null }) {
  const fuel = snapshot?.fuel
  const ers = snapshot?.ers
  const format = snapshot?.identity?.packetFormat
  const status = availability[snapshot?.tyreStatusFreshness ?? 'waiting']
  return (
    <>
      <section className="energy-panel" aria-labelledby="fuel-title" data-testid="fuel-panel">
        <h2 id="fuel-title">COMBUSTÍVEL — DADOS REAIS</h2>
        <p className="energy-caption" role="status" data-testid="fuel-availability">{status}</p>
        <dl className="energy-details">
          <div><dt>Combustível atual</dt><dd data-testid="fuel-tank">{quantity(fuel?.inTank, 'kg')}</dd></div>
          <div><dt>Capacidade informada</dt><dd data-testid="fuel-capacity">{quantity(fuel?.capacity, 'kg')}</dd></div>
          <div><dt>Voltas restantes (jogo / MFD)</dt><dd data-testid="fuel-laps">{quantity(fuel?.remainingLaps, 'voltas')}</dd></div>
        </dl>
        <p className="energy-caption">Estimativa do jogo, com sinal conforme o MFD; pode representar saldo de voltas.</p>
      </section>

      <section className="energy-panel" aria-labelledby="ers-title" data-testid="ers-panel">
        <h2 id="ers-title">ERS — DADOS REAIS</h2>
        <p className="energy-caption" role="status" data-testid="ers-availability">{status}</p>
        <dl className="energy-details">
          <div><dt>Energia armazenada</dt><dd data-testid="ers-store">{megajoules(ers?.storeEnergyJ)}</dd></div>
          <div><dt>Modo de utilização</dt><dd data-testid="ers-mode">{ers && format ? ersDeployModeLabel(format, ers.deployMode) : '—'}</dd></div>
          <div><dt>Utilizada nesta volta</dt><dd data-testid="ers-deployed">{megajoules(ers?.deployedThisLapJ)}</dd></div>
          <div><dt>Recuperada nesta volta · MGU-K</dt><dd data-testid="ers-mguk">{megajoules(ers?.harvestedThisLapMGUKJ)}</dd></div>
          <div><dt>Recuperada nesta volta · MGU-H</dt><dd data-testid="ers-mguh">{megajoules(ers?.harvestedThisLapMGUHJ)}</dd></div>
          {format === 2026 && <div><dt>Limite de recuperação nesta volta</dt><dd data-testid="ers-limit">{megajoules(ers?.harvestLimitPerLapJ)}</dd></div>}
        </dl>
        <p className="energy-caption">Modo informado pelo protocolo; não indica acionamento manual ou aerodinâmica ativa.</p>
      </section>
    </>
  )
}
