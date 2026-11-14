# Referência de protocolo — V0.2B

Cabeçalhos consultados em 13/11/2026; estruturas de telemetria e volta conferidas em 14/11/2026. Fontes primárias da EA:

- [Publicação oficial e seleção do formato no jogo](https://forums.ea.com/blog/f1-games-game-info-hub-en/ea-sports%E2%84%A2-f1%C2%AE25-2026-season-pack-udp-specification/12187347).
- [Estruturas oficiais 2025, PacketHeader e PacketId](https://forums.ea.com/t5/s/tghpe58374/attachments/tghpe58374/f1-games-game-info-hub-en/61/5/F1%2025%20Telemetry%20Output%20Structures.txt).
- [Estruturas oficiais 2026, PacketHeader e PacketId](https://forums.ea.com/t5/s/tghpe58374/attachments/tghpe58374/f1-games-game-info-hub-en/61/8/2026%20Season%20Pack%20Telemetry%20Output%20Structures%20%281%29.txt).
- [Data Output from F1 25 v3 — configuração UDP e especificação](https://forums.ea.com/t5/s/tghpe58374/attachments/tghpe58374/f1-games-game-info-hub-en/61/4/Data%20Output%20from%20F1%2025%20v3.pdf).
- [Data Output from F1 25: 2026 Season Pack — versão documental 1.1](https://forums.ea.com/t5/s/tghpe58374/attachments/tghpe58374/f1-games-game-info-hub-en/61/9/Data%20Output%20from%20F1%2025%202026%20Season%20Pack%20%281%29.pdf).

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

IDs documentados: 0–15 em 2025; 0–16 em 2026. A V0.2B decodifica somente IDs 2 (Lap Data) e 6 (Car Telemetry). ID 16 não é decodificado.

## Política de inspeção de cabeçalho (preservada da V0.2A)

- Menos de 29 bytes: inválido, sem qualquer leitura de campos. Esse limite também é aplicado conservadoramente a formatos desconhecidos.
- Formato diferente de 2025/2026: registra somente o prefixo `uint16` como não suportado. Não afirma que o restante seja um cabeçalho válido nem lê seu ID.
- Formato conhecido: verifica ID documentado, versão diferente de zero e tempo finito. Essas verificações mínimas são a política defensiva desta entrega; não constituem validação completa do datagrama.
- Versões de pacote positivas são registradas, sem afirmar suporte ao payload daquela versão. `gameYear` não determina o formato.
- O leitor não exige tamanho do payload, não interpreta dados de corrida e não autentica o remetente. Um buffer de apenas 29 bytes pode ter cabeçalho reconhecido.
- Tempo finito negativo, repetição e retrocesso de tempo/frame não causam descarte.
- As estatísticas contam também os datagramas inválidos/não suportados. Recepção significa tráfego local; não prova conexão com o F1 25.

## Payloads decodificados na V0.2B

`decodeTelemetry` exige formato conhecido, ID 2/6, versão 1, comprimento exato e índice válido antes de ler o payload. A versão de pacote 1 foi confirmada nos PDFs oficiais: 2025, páginas 5 e 10; 2026, páginas 6 e 10 (numeração humana). A versão documental 1.1 do PDF 2026 não é `packetVersion`. Não deduz suporte a revisões futuras pelos seus tamanhos. Não usa `gameYear` para escolher layout.

| Formato | Carros | Stride ID 6 | Total ID 6 | Stride ID 2 | Total ID 2 |
| --- | --- | --- | --- | --- | --- |
| 2025 | 22 | 60 | 1352 | 57 | 1285 |
| 2026 | 24 | 59 | 1448 | 57 | 1399 |

Derivação packed de `CarTelemetryData`: velocidade 2; acelerador/direção/freio 12; embreagem 1; marcha 1; RPM 2; DRS 1; percentual LEDs 1; bits LEDs 2; temperaturas dos freios 8; superfícies dos pneus 4; interiores dos pneus 4; temperatura do motor **2 em 2025, 1 em 2026**; pressões 16; superfícies 4. Soma: **60/59**. O trailer contém 3 bytes (dois índices MFD e marcha sugerida).

Derivação de `LapData`, igual nos dois anexos: tempos de volta 8; setores 6; deltas 6; distâncias/delta safety car 12; posição 1; volta 1; flags/contadores de pitStatus até pitLaneTimerActive 13; timers de pit 4; indicação de penalidade 1; speed trap 4; volta do speed trap 1. Soma: **57**. Trailer: 2 índices de time trial.

Assim, ID 6: `29 + 22×60 + 3 = 1352` ou `29 + 24×59 + 3 = 1448`. ID 2: `29 + 22×57 + 2 = 1285` ou `29 + 24×57 + 2 = 1399`.

Para o índice `i = playerCarIndex` (byte 27), base do carro = `29 + i×stride`. O índice deve estar em 0–21 ou 0–23; 255 é rejeitado. O jogador secundário não é selecionado.

| Dado | Offset no carro | Tipo | Offset absoluto |
| --- | --- | --- | --- |
| Velocidade km/h | 0 | uint16 LE | `29 + i×stride` |
| Marcha | 15 | int8 | `44 + i×stride` |
| Volta atual | 33 | uint8 | `62 + i×57` |

Marcha aceita -1, 0 e 1–8. Volta zero e velocidade zero são preservadas. O parser não inventa tetos plausíveis para velocidade/volta. Não valida semanticamente os campos não utilizados; pacote aceito não é certificação de todo o payload nem autenticação da origem. Pacotes rejeitados continuam contados no diagnóstico conforme a política de cabeçalho, sem contador de erros de payload nesta versão.

## Sessão, publicação e frescor

`RealTelemetrySource` consome os datagramas do socket existente, somente no Main. A identidade reúne formato, índice do jogador e `sessionUID` (uint64 lido como BigInt e convertido diretamente para string decimal, sem passar por number). Uma mudança observada em um pacote decodificado limpa ambos os grupos antes de aplicar o novo dado. Pacotes desconhecidos/rejeitados não mudam identidade nem renovam frescor.

Velocidade/marcha e volta guardam seus próprios frames, tempos de sessão e instantes locais de recepção. Podem chegar em qualquer ordem e com frames diferentes. O último pacote válido recebido de cada grupo prevalece, incluindo repetições e retrocessos. Não há reordenação, histórico nem reconciliação de flashbacks; um datagrama atrasado de outra sessão pode alternar novamente a identidade, sempre limpando os grupos.

Cada grupo vence em **3000 ms**, medidos com `performance.now()` (relógio monotônico local, independente do tempo do jogo). `getSnapshot()` calcula a validade no instante da consulta. O timer publica no máximo a cada **100 ms (10 Hz)** durante a recepção, inclusive transições de expiração sem tráfego. Rajadas são coalescidas no último estado, sem reter buffers. Início/parada e inscrições/pedidos de estado inicial são imediatos.

Estados de grupo: `waiting` (nunca recebido nesta identidade), `fresh` (idade < 3000 ms), `stale` (idade ≥ 3000 ms). Snapshot contém null para grupos ausentes/vencidos. Estado geral: `stale` se algum grupo venceu, `receiving` se existe dado fresco e nenhum vencido, `waiting` se nenhum dado chegou, `stopped` após parada. Um grupo fresco continua visível mesmo se o outro venceu; se apenas um chegou, a interface informa recepção parcial.

O início/reinício, erro ou parada do receptor invalida os dados; encerrar a fonte cancela as duas inscrições e o timer. Cancelamentos individuais são idempotentes. Silêncio UDP não significa pausa; pacotes repetidos mantêm frescor porque chegaram recentemente, sem afirmar avanço do jogo. Recarregar o Renderer mantém estado e socket; o Preload instala o listener antes de solicitar o snapshot, com remetente/frame validados no Main.

## Fixtures

`tests/fixtures/f1-header.ts` constrói cabeçalhos sintéticos com esses offsets, sessão fictícia 123, versão de pacote 1, tempo 10,5 e frame 100. O smoke test constrói uma fixture equivalente de formato 2026/ID 16. Não representam payloads completos nem capturas reais. Variantes curtas, IDs inválidos e números não finitos exercitam a rejeição segura.

`tests/fixtures/f1-telemetry.ts` e o smoke constroem também pacotes completos IDs 2/6, com comprimentos, strides e offsets acima. Carros não selecionados recebem valores distintos, incluindo testes no último índice. Os construtores não importam constantes do parser, para detectar divergências. Campos fora do escopo são sintéticos, em geral zerados. Nenhuma fixture é evidência de comparação com o HUD real.
