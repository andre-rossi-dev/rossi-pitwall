import type { PacketTiming } from './realTelemetry'

export interface RealTyreStatus extends PacketTiming {
  readonly actualCompound: number
  readonly visualCompound: number
  readonly ageLaps: number
}

// Percentual de desgaste enviado pelo jogo; não é dano nem aderência.
export interface RealTyreWear extends PacketTiming {
  readonly frontLeft: number
  readonly frontRight: number
  readonly rearLeft: number
  readonly rearRight: number
}

const actualCompounds: Readonly<Record<number, string>> = {
  7: 'Intermediário', 8: 'Chuva', 16: 'C5', 17: 'C4', 18: 'C3',
  19: 'C2', 20: 'C1', 21: 'C0', 22: 'C6'
}
const visualCompounds: Readonly<Record<number, string>> = {
  7: 'Intermediário', 8: 'Chuva', 16: 'Macio', 17: 'Médio', 18: 'Duro'
}

export function tyreCompoundLabel(code: number, kind: 'actual' | 'visual'): string {
  const labels = kind === 'actual' ? actualCompounds : visualCompounds
  return labels[code] ?? `Desconhecido (${code})`
}
