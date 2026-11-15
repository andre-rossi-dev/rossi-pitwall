// Energias brutas em J, sem capacidade máxima presumida.
export interface RealErs {
  readonly storeEnergyJ: number | null
  readonly deployMode: number
  readonly harvestedThisLapMGUKJ: number | null
  readonly harvestedThisLapMGUHJ: number | null
  readonly deployedThisLapJ: number | null
  // Ausente no formato 2025; null também representa um valor inválido em 2026.
  readonly harvestLimitPerLapJ: number | null
}

export function ersDeployModeLabel(format: 2025 | 2026, mode: number): string {
  switch (mode) {
    case 0: return 'Nenhum'
    case 1: return 'Médio'
    case 2: return 'Hotlap'
    case 3: return format === 2025 ? 'Overtake' : 'Boost'
    default: return `Indisponível (${mode})`
  }
}
