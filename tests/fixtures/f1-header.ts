// FIXTURE SINTÉTICA: não é captura do F1 25 e não contém payload de corrida.
// PacketHeader de 29 bytes, fundamentado nos anexos oficiais EA 2025 e 2026.
// Fontes, offsets e limites em docs/udp-protocol.md.
export function syntheticHeader(format = 2025, packetId = 6): Buffer {
  const buffer = Buffer.alloc(29)
  buffer.writeUInt16LE(format, 0)
  buffer.writeUInt8(format === 2026 ? 26 : 25, 2)
  buffer.writeUInt8(1, 3) // gameMajorVersion
  buffer.writeUInt8(0, 4) // gameMinorVersion
  buffer.writeUInt8(1, 5) // packetVersion
  buffer.writeUInt8(packetId, 6)
  buffer.writeBigUInt64LE(123n, 7) // sessionUID fictício
  buffer.writeFloatLE(10.5, 15) // sessionTime
  buffer.writeUInt32LE(100, 19) // frameIdentifier
  buffer.writeUInt32LE(200, 23) // overallFrameIdentifier
  buffer.writeUInt8(0, 27) // playerCarIndex
  buffer.writeUInt8(255, 28) // sem segundo jogador
  return buffer
}
