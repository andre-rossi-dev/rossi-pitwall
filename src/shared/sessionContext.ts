import type { PacketTiming } from './realTelemetry'

// IDs dos apêndices EA 2025/2026; rótulos apenas para apresentação.
export const SESSION_TYPES = {
  1: 'Treino livre 1', 2: 'Treino livre 2', 3: 'Treino livre 3', 4: 'Treino curto',
  5: 'Classificação 1', 6: 'Classificação 2', 7: 'Classificação 3',
  8: 'Classificação curta', 9: 'Classificação de volta única',
  10: 'Classificação sprint 1', 11: 'Classificação sprint 2', 12: 'Classificação sprint 3',
  13: 'Classificação sprint curta', 14: 'Classificação sprint de volta única',
  15: 'Corrida', 16: 'Corrida 2', 17: 'Corrida 3', 18: 'Contrarrelógio'
} as const

export const TRACKS = {
  0: 'Melbourne', 2: 'Shanghai', 3: 'Sakhir', 4: 'Catalunya', 5: 'Mônaco',
  6: 'Montreal', 7: 'Silverstone', 9: 'Hungaroring', 10: 'Spa', 11: 'Monza',
  12: 'Singapura', 13: 'Suzuka', 14: 'Abu Dhabi', 15: 'Texas', 16: 'Brasil',
  17: 'Áustria', 19: 'México', 20: 'Baku', 26: 'Zandvoort', 27: 'Imola',
  29: 'Jeddah', 30: 'Miami', 31: 'Las Vegas', 32: 'Losail',
  39: 'Silverstone (invertido)', 40: 'Áustria (invertido)', 41: 'Zandvoort (invertido)',
  42: 'Madrid'
} as const

export type SessionType = keyof typeof SESSION_TYPES
export type TrackId = keyof typeof TRACKS

export interface SessionDetails {
  readonly sessionType: SessionType | null
  readonly trackId: TrackId | null
  // uint32 opacos fornecidos pelo jogo; zero vira null. Não são sessionUID.
  readonly seasonLinkIdentifier: number | null
  readonly weekendLinkIdentifier: number | null
  readonly sessionLinkIdentifier: number | null
}

export interface SessionContext extends SessionDetails, PacketTiming {}

export type SessionContextStatus = 'unidentified' | 'identified' | 'unavailable'
