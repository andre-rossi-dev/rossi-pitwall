import type { HeaderInspection } from '../../shared/udp'

// EA: PacketHeader e PacketId dos anexos 2025/2026. Referências e offsets em
// docs/udp-protocol.md. Apenas o cabeçalho é inspecionado; o payload não é validado.
export const HEADER_SIZE = 29

export function inspectHeader(datagram: Buffer): HeaderInspection {
  if (datagram.length < HEADER_SIZE) {
    return { kind: 'invalid', reason: 'Cabeçalho incompleto: mínimo de 29 bytes.' }
  }

  const packetFormat = datagram.readUInt16LE(0)
  if (packetFormat !== 2025 && packetFormat !== 2026) {
    // Só o prefixo é observado. Não presumimos o restante do layout desconhecido.
    return { kind: 'unsupported', packetFormat }
  }

  const packetVersion = datagram.readUInt8(5)
  const packetId = datagram.readUInt8(6)
  const sessionTime = datagram.readFloatLE(15)
  if (packetId > (packetFormat === 2025 ? 15 : 16)) {
    return { kind: 'invalid', reason: 'packetId fora da especificação deste formato.' }
  }
  if (packetVersion === 0 || !Number.isFinite(sessionTime)) {
    return { kind: 'invalid', reason: 'Versão de pacote ou tempo de sessão inválido.' }
  }

  return {
    kind: 'recognized', packetFormat, packetId, packetVersion, sessionTime,
    frameId: datagram.readUInt32LE(19)
  }
}
