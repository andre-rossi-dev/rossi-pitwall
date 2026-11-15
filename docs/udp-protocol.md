# Referência de protocolo — V0.2C-A

Cabeçalhos consultados em 13/11/2026; estruturas de telemetria e volta e semântica temporal dos dois anexos TXT reconferidas em 14/11/2026. Fontes primárias da EA:

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

Nos dois formatos, a EA define `sessionUID` como identificador único de sessão, `sessionTime` como timestamp da sessão e `frameIdentifier` como o frame da coleta. `overallFrameIdentifier` é o identificador geral do frame da coleta e explicitamente não retrocede após flashbacks. `packetFormat` seleciona o formato e `playerCarIndex` seleciona o carro no array. Os offsets foram reconferidos pela soma dos tipos packed, nos dois anexos. O decoder lê o contador geral como uint32 LE no offset 23 e o publica como `overallFrameId`; a inspeção de diagnóstico permanece inalterada.

Essas definições não garantem entrega/ordem UDP, autenticidade, frequência de avanço, tratamento de empates ou comportamento de overflow. A comparação modular e a confirmação de identidade abaixo são políticas locais defensivas, não garantias adicionais da EA.

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

`RealTelemetrySource` consome os datagramas do socket existente, somente no Main. A identidade reúne formato, índice do jogador e `sessionUID` (uint64 lido como BigInt e convertido diretamente para string decimal, sem passar por number). Pacotes desconhecidos/rejeitados não mudam identidade nem renovam frescor.

### Ordem por grupo

Velocidade/marcha e volta guardam seus próprios contadores, tempos de sessão e instantes locais de recepção. O primeiro pacote de cada grupo na identidade ativa é aceito. Depois, somente um `overallFrameId` considerado mais novo substitui esse grupo. Não se comparam os frames de ID 2 com os de ID 6, nem frames entre identidades. Frequências e ordens diferentes continuam permitidas.

A distância é `(novo - anterior) >>> 0`: o operador JavaScript converte a diferença para uint32, implementando módulo 2³². Distância entre 1 e 2³¹−1 é aceita; zero é duplicação e mantém a primeira amostra, inclusive se o payload divergir; exatamente 2³¹ é ambíguo e é rejeitado; distância maior é tratada como atraso. Isso permite `0xffffffff → 0` e rejeita um pacote pré-wrap atrasado. A regra pressupõe distância real inferior a meia faixa: não resolve saltos maiores, resets inesperados do contador na mesma identidade ou voltas completas sem observação. Não usamos tempo local para adivinhar a ordem desses casos.

`frameIdentifier`, `sessionTime` e volta podem diminuir livremente quando o contador geral avança. Essa é a distinção usada para preservar flashbacks; não há inferência por volta/tempo nem reconciliação completa entre grupos. Até chegar a próxima amostra de cada grupo, eles podem representar momentos diferentes. Um pacote repetido/atrasado/ambíguo não substitui valores, não renova frescor e não gera publicação de telemetria; continua contado no diagnóstico UDP.

### Confirmação e troca de identidade

1. Sem identidade ativa (início ou reinício), o primeiro pacote decodificado válido assume imediatamente.
2. Identidade diferente fica candidata, com no máximo uma amostra por grupo e sem publicação. É necessário observar **dois pacotes do mesmo grupo com avanço do contador geral**, dentro de **1000 ms** desde o primeiro pacote candidato. Não é necessário receber ambos os IDs. Duplicações, atrasos e ambiguidade não confirmam nem estendem essa janela. No limite exato, uma nova candidatura começa.
3. Uma amostra aceita da identidade ativa cancela a candidatura. Uma terceira identidade substitui a candidata. Pacotes rejeitados pelo parser ou de UIDs bloqueados não participam. Apenas tráfego descartado da identidade ativa não cancela a candidatura.
4. Confirmada a candidata, os dois grupos ativos são limpos antes de aplicar suas amostras, preservando os instantes originais de recepção. Nenhum valor antigo é combinado com a nova identidade; a publicação só ocorre após essa transição síncrona.
5. Quando muda o UID, o UID anterior entra em uma fila limitada aos **8 últimos UIDs substituídos**, em memória. Qualquer pacote desses UIDs é ignorado pela fonte real, inclusive após silêncio. Trocar apenas formato/carro não aposenta o UID: é possível alternar 2025 → 2026 → 2025 ou mudar de jogador e voltar, sempre com confirmação.

Os limiares são escolhas locais, não parâmetros prescritos pela EA. A confirmação reduz troca por pacote isolado, e a fila bloqueia inclusive rajadas de sessões recentemente substituídas. Isso não autentica uma sessão nova: uma rajada coerente de identidade desconhecida, de formato/carro anterior sob o mesmo UID, ou de UID já removido da fila ainda pode assumir. A primeira identidade após início também pode vir de pacote atrasado. Reutilizar um UID ainda retido (por exemplo, se uma retomada de save fizer isso) é bloqueado até sua remoção da fila ou reinício do receptor/fonte; esse comportamento do jogo ainda exige validação. Não há timeout que apague essa proteção em silêncio, histórico persistente ou gerenciador de sessões.

### Frescor, interrupção e ciclo de vida

Cada grupo vence em **3000 ms**, medidos com `performance.now()` (relógio monotônico local, independente do tempo do jogo). `getSnapshot()` calcula a validade no instante da consulta. O timer publica no máximo a cada **100 ms (10 Hz)** durante a recepção, inclusive transições de expiração sem tráfego. Rajadas são coalescidas no último estado, sem reter buffers. Início/parada e inscrições/pedidos de estado inicial são imediatos.

Estados de grupo: `waiting` (nunca recebido nesta identidade), `fresh` (idade < 3000 ms), `stale` (idade ≥ 3000 ms). Snapshot contém null para grupos ausentes/vencidos. Estado geral: `stale` se algum grupo venceu, `receiving` se existe dado fresco e nenhum vencido, `waiting` se nenhum dado chegou, `stopped` após parada. Um grupo fresco continua visível mesmo se o outro venceu; se apenas um chegou, a interface informa recepção parcial.

O início/reinício, erro ou parada do receptor invalida os dados e limpa candidatura, referências de ordem e fila de UIDs. Encerrar a fonte cancela as duas inscrições e o timer. Cancelamentos individuais são idempotentes. Silêncio/diagnóstico `idle`, expiração, pausa e Alt+Tab não limpam identidade nem referências de ordem. A retomada aceita a próxima amostra com avanço em cada grupo. Se o jogo enviar somente o mesmo contador durante uma pausa, as métricas vencem mesmo com tráfego no diagnóstico; chegada recente não comprova medição nova. Silêncio UDP não significa pausa, e tempo local não produz progresso de corrida. Recarregar o Renderer mantém estado e socket; o Preload instala o listener antes de solicitar o snapshot, com remetente/frame validados no Main.

## Fixtures

`tests/fixtures/f1-header.ts` constrói cabeçalhos sintéticos com esses offsets, sessão fictícia 123, versão de pacote 1, tempo 10,5 e frame 100. O smoke test constrói uma fixture equivalente de formato 2026/ID 16. Não representam payloads completos nem capturas reais. Variantes curtas, IDs inválidos e números não finitos exercitam a rejeição segura.

`tests/fixtures/f1-telemetry.ts` e o smoke constroem também pacotes completos IDs 2/6, com comprimentos, strides e offsets acima. Frame comum e contador geral são configuráveis independentemente, inclusive para flashbacks e wraparound sintéticos. Carros não selecionados recebem valores distintos, incluindo testes no último índice. Os construtores não importam constantes do parser, para detectar divergências. Campos fora do escopo são sintéticos, em geral zerados. Nenhuma fixture é evidência de comparação com o HUD real. Resultados e roteiro manual da política temporal: [Validação V0.2C-A](validation-v0.2c-a.md).
