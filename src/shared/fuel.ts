// Valores do ID 7 sem arredondamento; null indica campo inválido.
// Massa apresentada em kg por convenção; ver a ressalva em docs/udp-protocol.md.
export interface RealFuel {
  readonly inTank: number | null
  readonly capacity: number | null
  // Estimativa do MFD, preservando o sinal. Não é previsão do Pitwall.
  readonly remainingLaps: number | null
}
