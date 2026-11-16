import type { RealTelemetrySnapshot } from '../../shared/realTelemetry'
import { racePositionPresentation } from './racePosition'

export function RacePositionPanel({ snapshot }: { readonly snapshot: RealTelemetrySnapshot | null }) {
  const view = racePositionPresentation(snapshot)
  return (
    <section className="energy-panel" aria-labelledby="race-position-title" data-testid="race-position-panel">
      <h2 id="race-position-title">POSIÇÃO E DIFERENÇAS — DADOS REAIS</h2>
      <p className="energy-caption" role="status" data-testid="race-availability">{view.availability}</p>
      <dl className="energy-details">
        <div><dt>Posição do jogador</dt><dd data-testid="race-position">{view.position}</dd></div>
        <div><dt>Para o carro à frente</dt><dd data-testid="race-front">{view.front}</dd></div>
        <div><dt>Para o líder</dt><dd data-testid="race-leader">{view.leader}</dd></div>
      </dl>
      <p className="energy-caption">Diferenças informadas pelo jogo; não representam necessariamente intervalos contínuos. — indica dado indisponível ou não aplicável.</p>
    </section>
  )
}
