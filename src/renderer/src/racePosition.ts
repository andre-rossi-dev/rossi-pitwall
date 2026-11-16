import type { RealTelemetrySnapshot } from '../../shared/realTelemetry'

const seconds = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 3, maximumFractionDigits: 3, useGrouping: false
})

function formatGap(msPart: number, minutesPart: number): string {
  // A parcela de ms deve caber em um minuto. Zero e parcelas não canônicas
  // permanecem brutos no snapshot, mas não recebem significado presumido.
  if (msPart >= 60_000 || (msPart === 0 && minutesPart === 0)) return '—'
  return minutesPart === 0
    ? `${seconds.format(msPart / 1000)} s`
    : `${minutesPart} min ${seconds.format(msPart / 1000)} s`
}

export function racePositionPresentation(snapshot: RealTelemetrySnapshot | null) {
  const unavailable = (availability: string) => ({ position: '—', front: '—', leader: '—', availability })
  if (snapshot?.lapFreshness === 'stale') return unavailable('Dados desatualizados')
  if (!snapshot?.lap || snapshot.lapFreshness !== 'fresh') return unavailable('Aguardando dados')
  const sessionType = snapshot.context?.sessionType
  if (snapshot.contextStatus !== 'identified' || sessionType == null) {
    return unavailable('Contexto de corrida indisponível')
  }
  // IDs oficiais Race / Race 2 / Race 3. Não interpretamos classificação
  // ou ordem na pista de treinos como posição de corrida.
  if (sessionType !== 15 && sessionType !== 16 && sessionType !== 17) {
    return unavailable('Disponível somente em corrida')
  }
  const lap = snapshot.lap
  if (lap.resultStatus !== 2) return unavailable('Jogador sem estado ativo de corrida')
  const maxPosition = snapshot.identity?.packetFormat === 2025 ? 22 : 24
  if (!snapshot.identity || lap.carPosition < 1 || lap.carPosition > maxPosition) {
    return unavailable('Posição indisponível')
  }
  const position = `P${lap.carPosition}`
  if (lap.carPosition === 1) return { ...unavailable('Líder · diferenças não aplicáveis'), position }
  const front = formatGap(lap.deltaToCarInFrontMSPart, lap.deltaToCarInFrontMinutesPart)
  const leader = formatGap(lap.deltaToRaceLeaderMSPart, lap.deltaToRaceLeaderMinutesPart)
  return {
    position, front, leader,
    availability: front === '—' || leader === '—' ? 'Diferenças parcial ou totalmente indisponíveis' : 'Dados recebidos'
  }
}
