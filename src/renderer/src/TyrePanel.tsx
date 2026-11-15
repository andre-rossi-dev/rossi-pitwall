import type { DataFreshness, RealTelemetrySnapshot } from '../../shared/realTelemetry'
import { tyreCompoundLabel } from '../../shared/tyres'

const availability: Record<DataFreshness, string> = {
  waiting: 'aguardando dados', fresh: 'disponível', stale: 'dados desatualizados'
}
const wheels = [
  ['frontLeft', 'FE', 'Dianteiro esquerdo'], ['frontRight', 'FD', 'Dianteiro direito'],
  ['rearLeft', 'TE', 'Traseiro esquerdo'], ['rearRight', 'TD', 'Traseiro direito']
] as const
const percent = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

export function TyrePanel({ snapshot }: { readonly snapshot: RealTelemetrySnapshot | null }) {
  const status = snapshot?.tyreStatus
  const wear = snapshot?.tyreWear
  return (
    <section className="tyre-panel" aria-labelledby="tyre-title" data-testid="tyre-panel">
      <h2 id="tyre-title">PNEUS — DADOS REAIS</h2>
      <p className="tyre-availability" role="status" data-testid="tyre-availability">
        Composto/idade: {availability[snapshot?.tyreStatusFreshness ?? 'waiting']}
        {' · '}Desgaste: {availability[snapshot?.tyreWearFreshness ?? 'waiting']}
      </p>
      <dl className="tyre-details">
        <div><dt>Composto visual</dt><dd data-testid="tyre-visual">{status ? tyreCompoundLabel(status.visualCompound, 'visual') : '—'}</dd></div>
        <div><dt>Composto real</dt><dd data-testid="tyre-actual">{status ? tyreCompoundLabel(status.actualCompound, 'actual') : '—'}</dd></div>
        <div><dt>Idade (voltas)</dt><dd data-testid="tyre-age">{status?.ageLaps ?? '—'}</dd></div>
      </dl>
      <p className="tyre-caption">Desgaste informado pelo jogo</p>
      <dl className="tyre-wheels">
        {wheels.map(([key, abbreviation, label]) => (
          <div key={key}>
            <dt><abbr title={label}>{abbreviation}</abbr></dt>
            <dd data-testid={`tyre-${key}`}>{wear ? `${percent.format(wear[key])}%` : '—'}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
