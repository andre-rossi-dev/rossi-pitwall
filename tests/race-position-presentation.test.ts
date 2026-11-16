import { describe, expect, it } from 'vitest'
import { racePositionPresentation } from '../src/renderer/src/racePosition'
import { decodeTelemetry } from '../src/main/udp/decodeTelemetry'
import { decodeSession } from '../src/main/udp/decodeSession'
import { RealTelemetrySource } from '../src/main/telemetry/RealTelemetrySource'
import type { RealTelemetrySnapshot } from '../src/shared/realTelemetry'
import { syntheticTelemetry } from './fixtures/f1-telemetry'
import { syntheticSession } from './fixtures/f1-session'

// Somente dados sintéticos; usa contratos reais sem casts que escondam campos faltantes.
function snapshot(format: 2025 | 2026): RealTelemetrySnapshot {
  const lap = decodeTelemetry(syntheticTelemetry(2, { format }))!
  const session = decodeSession(syntheticSession({ format, sessionType: 15 }))!
  if (lap.kind !== 'lap') throw new Error('Fixture Lap Data esperada')
  const empty = new RealTelemetrySource({ subscribe: () => () => {}, subscribeDatagrams: () => () => {} }).getSnapshot()
  return { ...empty, identity: lap, lap: lap.data, lapFreshness: 'fresh', context: session.data, contextStatus: 'identified' }
}

describe.each([2025, 2026] as const)('apresentação de corrida %i — sintética', (format) => {
  it('formata milissegundos sem arredondamento prematuro e minutos separados', () => {
    const data = snapshot(format)
    expect(racePositionPresentation(data)).toEqual({ position: 'P5', front: '1,234 s', leader: '1 min 2,345 s', availability: 'Dados recebidos' })
    expect(data.lap?.deltaToRaceLeaderMSPart).toBe(2345)
  })

  it.each([
    [1, 0, '0,001 s'], [59999, 0, '59,999 s'], [0, 1, '1 min 0,000 s'],
    [59999, 255, '255 min 59,999 s'], [0, 0, '—'], [60000, 0, '—'], [65535, 1, '—']
  ] as const)('apresenta parcela %i ms + %i min como %s', (ms, minutes, expected) => {
    const data = snapshot(format)
    const view = racePositionPresentation({ ...data, lap: { ...data.lap!, deltaToCarInFrontMSPart: ms, deltaToCarInFrontMinutesPart: minutes } })
    expect(view.front).toBe(expected)
    expect(view.leader).toBe('1 min 2,345 s')
    expect(view.position).toBe('P5')
    expect(view.availability).toBe(expected === '—' ? 'Diferenças parcial ou totalmente indisponíveis' : 'Dados recebidos')
  })

  it('não transforma liderança em gap zero mesmo recebendo deltas positivos', () => {
    const data = snapshot(format)
    expect(racePositionPresentation({ ...data, lap: { ...data.lap!, carPosition: 1 } }))
      .toEqual({ position: 'P1', front: '—', leader: '—', availability: 'Líder · diferenças não aplicáveis' })
  })

  it.each([0, (format === 2025 ? 22 : 24) + 1, 255])('oculta posição inválida %i e gaps', (carPosition) => {
    const data = snapshot(format)
    expect(racePositionPresentation({ ...data, lap: { ...data.lap!, carPosition } }))
      .toMatchObject({ position: '—', front: '—', leader: '—' })
  })

  it('aceita a última posição do formato, independentemente do índice', () => {
    const data = snapshot(format)
    const carPosition = format === 2025 ? 22 : 24
    expect(racePositionPresentation({ ...data, lap: { ...data.lap!, carPosition } }).position).toBe(`P${carPosition}`)
  })

  it.each([0, 1, 3, 4, 5, 6, 7, 255])('não apresenta jogador sem estado ativo (%i)', (resultStatus) => {
    const data = snapshot(format)
    expect(racePositionPresentation({ ...data, lap: { ...data.lap!, resultStatus } }))
      .toMatchObject({ position: '—', front: '—', leader: '—', availability: 'Jogador sem estado ativo de corrida' })
  })

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 18] as const)('não presume semântica de corrida na sessão %i', (sessionType) => {
    const data = snapshot(format)
    expect(racePositionPresentation({ ...data, context: { ...data.context!, sessionType } }))
      .toMatchObject({ position: '—', front: '—', leader: '—', availability: 'Disponível somente em corrida' })
  })

  it.each([15, 16, 17] as const)('reconhece tipo de corrida %i', (sessionType) => {
    const data = snapshot(format)
    expect(racePositionPresentation({ ...data, context: { ...data.context!, sessionType } }).position).toBe('P5')
  })

  it('oculta dados sem contexto válido, ausentes ou vencidos', () => {
    const data = snapshot(format)
    for (const change of [
      { context: null }, { contextStatus: 'unavailable' as const },
      { context: { ...data.context!, sessionType: null } },
      { lap: null, lapFreshness: 'waiting' as const }, { lapFreshness: 'stale' as const }, { identity: null }
    ]) expect(racePositionPresentation({ ...data, ...change })).toMatchObject({ position: '—', front: '—', leader: '—' })
    expect(racePositionPresentation(null)).toEqual({ position: '—', front: '—', leader: '—', availability: 'Aguardando dados' })
  })
})
