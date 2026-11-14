# Referência de protocolo — V0.2A

Consulta em 13/11/2026. Fontes primárias da EA:

- [Publicação oficial e seleção do formato no jogo](https://forums.ea.com/blog/f1-games-game-info-hub-en/ea-sports%E2%84%A2-f1%C2%AE25-2026-season-pack-udp-specification/12187347).
- [Estruturas oficiais 2025, PacketHeader e PacketId](https://forums.ea.com/t5/s/tghpe58374/attachments/tghpe58374/f1-games-game-info-hub-en/61/5/F1%2025%20Telemetry%20Output%20Structures.txt).
- [Estruturas oficiais 2026, PacketHeader e PacketId](https://forums.ea.com/t5/s/tghpe58374/attachments/tghpe58374/f1-games-game-info-hub-en/61/8/2026%20Season%20Pack%20Telemetry%20Output%20Structures%20%281%29.txt).
- [Data Output from F1 25 v3 — configuração UDP e especificação](https://forums.ea.com/t5/s/tghpe58374/attachments/tghpe58374/f1-games-game-info-hub-en/61/4/Data%20Output%20from%20F1%2025%20v3.pdf).

## Layout usado

Os anexos 2025 e 2026 definem cabeçalho de 29 bytes. Os offsets abaixo resultam dos tamanhos dos campos, sem padding; a leitura dos números multibyte usa little-endian.

| Offset | Bytes | Campo |
| --- | --- | --- |
| 0 | 2 | packetFormat |
| 2 | 1 | gameYear |
| 3 | 1 | gameMajorVersion |
| 4 | 1 | gameMinorVersion |
| 5 | 1 | packetVersion |
| 6 | 1 | packetId |
| 7 | 8 | sessionUID |
| 15 | 4 | sessionTime (float) |
| 19 | 4 | frameIdentifier |
| 23 | 4 | overallFrameIdentifier |
| 27 | 1 | playerCarIndex |
| 28 | 1 | secondaryPlayerCarIndex |

IDs documentados: 0–15 em 2025; 0–16 em 2026. O ID 6 indica Car Telemetry; 16, em 2026, Car Telemetry 2. A V0.2A registra o ID, mas não decodifica o conteúdo desses pacotes.

## Política implementada

- Menos de 29 bytes: inválido, sem qualquer leitura de campos. Esse limite também é aplicado conservadoramente a formatos desconhecidos.
- Formato diferente de 2025/2026: registra somente o prefixo `uint16` como não suportado. Não afirma que o restante seja um cabeçalho válido nem lê seu ID.
- Formato conhecido: verifica ID documentado, versão diferente de zero e tempo finito. Essas verificações mínimas são a política defensiva desta entrega; não constituem validação completa do datagrama.
- Versões de pacote positivas são registradas, sem afirmar suporte ao payload daquela versão. `gameYear` não determina o formato.
- O leitor não exige tamanho do payload, não interpreta dados de corrida e não autentica o remetente. Um buffer de apenas 29 bytes pode ter cabeçalho reconhecido.
- Tempo finito negativo, repetição e retrocesso de tempo/frame não causam descarte.
- As estatísticas contam também os datagramas inválidos/não suportados. Recepção significa tráfego local; não prova conexão com o F1 25.

## Fixtures

`tests/fixtures/f1-header.ts` constrói cabeçalhos sintéticos com esses offsets, sessão fictícia 123, versão de pacote 1, tempo 10,5 e frame 100. O smoke test constrói uma fixture equivalente de formato 2026/ID 16. Não representam payloads completos nem capturas reais. Variantes curtas, IDs inválidos e números não finitos exercitam a rejeição segura.
