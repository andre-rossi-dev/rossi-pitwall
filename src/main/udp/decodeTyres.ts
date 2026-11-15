import type { RealTelemetryIdentity } from '../../shared/realTelemetry'
import type { RealTyreStatus, RealTyreWear } from '../../shared/tyres'
import type { RealFuel } from '../../shared/fuel'
import type { RealErs } from '../../shared/ers'
import { HEADER_SIZE, inspectHeader } from './inspectHeader'

// Layouts packed conferidos separadamente nos anexos oficiais EA.
// ID 7 acrescenta 4 bytes por carro em 2026; ID 10 mantém o stride.
const layouts = {
  2025: { cars: 22, status: { size: 1239, stride: 55 }, wear: { size: 1041, stride: 46 } },
  2026: { cars: 24, status: { size: 1445, stride: 59 }, wear: { size: 1133, stride: 46 } }
} as const

export type DecodedTyres = RealTelemetryIdentity & (
  // O grupo histórico tyreStatus representa todo o ID 7: um único timing e
  // uma única decisão de aceitação para pneus, combustível e ERS.
  | { readonly kind: 'tyreStatus'; readonly data: RealTyreStatus; readonly fuel: RealFuel; readonly ers: RealErs }
  | { readonly kind: 'tyreWear'; readonly data: RealTyreWear }
)

function finite(value: number): number | null {
  return Number.isFinite(value) ? value : null
}

function nonNegative(value: number): number | null {
  return Number.isFinite(value) && value >= 0 ? value : null
}

export function decodeTyres(datagram: Buffer): DecodedTyres | null {
  const header = inspectHeader(datagram)
  if (header.kind !== 'recognized' || header.packetVersion !== 1) return null
  if (header.packetId !== 7 && header.packetId !== 10) return null
  const layout = layouts[header.packetFormat]
  const packetLayout = header.packetId === 7 ? layout.status : layout.wear
  if (datagram.length !== packetLayout.size) return null
  const playerCarIndex = datagram.readUInt8(27)
  if (playerCarIndex >= layout.cars) return null

  const identity: RealTelemetryIdentity = {
    sessionId: datagram.readBigUInt64LE(7).toString(),
    packetFormat: header.packetFormat, playerCarIndex
  }
  const timing = {
    frameId: header.frameId, overallFrameId: datagram.readUInt32LE(23),
    sessionTimeSeconds: header.sessionTime
  }
  // Tamanho exato e índice válido garantem os limites de todas as leituras abaixo.
  const base = HEADER_SIZE + playerCarIndex * packetLayout.stride
  if (header.packetId === 7) {
    return { ...identity, kind: 'tyreStatus', data: {
      ...timing, actualCompound: datagram.readUInt8(base + 25),
      visualCompound: datagram.readUInt8(base + 26), ageLaps: datagram.readUInt8(base + 27)
    }, fuel: {
      inTank: nonNegative(datagram.readFloatLE(base + 5)),
      capacity: nonNegative(datagram.readFloatLE(base + 9)),
      remainingLaps: finite(datagram.readFloatLE(base + 13))
    }, ers: {
      storeEnergyJ: nonNegative(datagram.readFloatLE(base + 37)),
      deployMode: datagram.readUInt8(base + 41),
      harvestedThisLapMGUKJ: nonNegative(datagram.readFloatLE(base + 42)),
      harvestedThisLapMGUHJ: nonNegative(datagram.readFloatLE(base + 46)),
      harvestLimitPerLapJ: header.packetFormat === 2026
        ? nonNegative(datagram.readFloatLE(base + 50)) : null,
      deployedThisLapJ: nonNegative(datagram.readFloatLE(base + (header.packetFormat === 2026 ? 54 : 50)))
    } }
  }
  // Ordem EA: RL, RR, FL, FR → TE, TD, FE, FD. Sem conversão de escala.
  const rearLeft = datagram.readFloatLE(base)
  const rearRight = datagram.readFloatLE(base + 4)
  const frontLeft = datagram.readFloatLE(base + 8)
  const frontRight = datagram.readFloatLE(base + 12)
  // Política atômica: uma roda inválida rejeita o grupo inteiro, sem renovar frescor.
  if ([rearLeft, rearRight, frontLeft, frontRight].some(
    (wear) => !Number.isFinite(wear) || wear < 0 || wear > 100
  )) return null
  return { ...identity, kind: 'tyreWear', data: { ...timing, frontLeft, frontRight, rearLeft, rearRight } }
}
