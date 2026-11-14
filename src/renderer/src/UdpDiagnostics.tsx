import { useEffect, useState } from 'react'
import type { UdpDiagnosticSnapshot, UdpStatus } from '../../shared/udp'

const statusLabels: Record<UdpStatus, string> = {
  stopped: 'Receptor parado', starting: 'Abrindo receptor',
  listening: 'Aguardando datagramas', receiving: 'Recebendo datagramas',
  idle: 'Sem datagramas há pelo menos 3 s', error: 'Erro no receptor'
}

export function UdpDiagnostics() {
  const [diagnostic, setDiagnostic] = useState<UdpDiagnosticSnapshot | null>(null)
  useEffect(() => window.pitwall.onUdpDiagnostics(setDiagnostic), [])
  const packet = diagnostic?.lastPacket
  const protocol = packet?.kind === 'recognized'
    ? `Formato ${packet.packetFormat} · ID ${packet.packetId} · versão ${packet.packetVersion}`
    : packet?.kind === 'unsupported'
      ? `Formato não suportado: ${packet.packetFormat} · layout não interpretado`
      : packet?.kind === 'invalid' ? packet.reason : 'Nenhum cabeçalho identificado'

  return (
    <section className="udp-diagnostics" aria-labelledby="udp-title" data-testid="udp-diagnostics">
      <div className="udp-heading">
        <h2 id="udp-title">Diagnóstico UDP</h2>
        <span role="status" data-testid="udp-status">
          {diagnostic ? statusLabels[diagnostic.status] : 'Aguardando diagnóstico'}
        </span>
      </div>
      <p>{diagnostic?.address ?? '127.0.0.1'}:{diagnostic?.port ?? '—'} ·{' '}
        <span data-testid="udp-packets">{diagnostic?.packetsReceived ?? 0}</span> pacotes ·{' '}
        {diagnostic?.bytesReceived ?? 0} bytes
      </p>
      <p data-testid="udp-protocol">Último datagrama: {protocol}</p>
      <p>Cabeçalhos 2025: {diagnostic?.headers2025 ?? 0} · 2026: {diagnostic?.headers2026 ?? 0} ·{' '}
        Inválidos: {diagnostic?.invalidPackets ?? 0} · Não suportados: {diagnostic?.unsupportedPackets ?? 0}
      </p>
      {diagnostic?.error && <p className="udp-error" role="alert">{diagnostic.error}</p>}
      <p>Somente diagnóstico de recepção. Velocidade, marcha e volta acima continuam simuladas.</p>
    </section>
  )
}
