# Referência de protocolo — V0.3A

Cabeçalhos consultados em 13/11/2026; estruturas de telemetria, volta e Session Data, semântica temporal e apêndices consultados em 14/11/2026 nos anexos TXT/PDF. Implementação de contexto concluída em 15/11/2026. Fontes primárias da EA:

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

IDs documentados: 0–15 em 2025; 0–16 em 2026. A V0.3A decodifica campos mínimos dos IDs 1 (Session Data), 2 (Lap Data), 6 (Car Telemetry), 7 (Car Status) e 10 (Car Damage). ID 16 não é decodificado.

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

## Session Data mínimo — V0.2C-B

`decodeSession` valida cabeçalho, ID 1, **packetVersion 1**, comprimento exato e índice do jogador (0–21 em 2025; 0–23 em 2026). O índice associa o contexto à identidade técnica usada pelas métricas, mesmo que ID 1 não contenha um array por carro. Versão, frequência nominal de 2 Hz e tamanhos constam na página 4 de ambos os PDFs (numeração humana). A versão documental 1.1 do PDF 2026 não altera `packetVersion`.

| Campo | Tipo | Offset 2025 | Offset 2026 |
| --- | --- | --- | --- |
| packetFormat | uint16 LE | 0 | 0 |
| sessionUID | uint64 LE → string decimal | 7 | 7 |
| sessionType | uint8 | 35 | 35 |
| trackId | int8 | 36 | 36 |
| seasonLinkIdentifier | uint32 LE | 670 | 670 |
| weekendLinkIdentifier | uint32 LE | 674 | 674 |
| sessionLinkIdentifier | uint32 LE | 678 | 678 |
| Comprimento total | bytes | **753** | **926** |

Os offsets foram derivados separadamente em cada TXT: cabeçalho 29 + weather/temperaturas/totalLaps 4 + trackLength 2 = 35. Tipo e circuito ocupam os dois bytes seguintes. Até numMarshalZones inclusive são 19 bytes após o cabeçalho; seguem 21 zonas × 5 bytes, três bytes de status/contagem, 64 previsões × 8 bytes e dois bytes de precisão/dificuldade: `29 + 19 + 105 + 3 + 512 + 2 = 670`. Os três vínculos ocupam 12 bytes até 681. Esses arrays são apenas contabilizados para derivar offsets, sem interpretação no parser.

Em 2025, os campos restantes ocupam 71 bytes: `682 + 71 = 753`. Em 2026, a estrutura até 752 coincide; o acréscimo final soma `1 + 1 + 8×8 + 1 + 8×8 + 1 + 4×8 + 4 + 5 = 173` bytes (zonas aero/DRS e opções), totalizando **926**. O decoder mantém entradas de layout separadas e rejeita o tamanho de outro formato.

Tipos reconhecidos: IDs 1–18 dos apêndices (TL1–3, treino curto, classificações, corrida e contrarrelógio); 0 e demais valores tornam-se `null`. Circuitos seguem as tabelas da página 25 do PDF 2025 e 27 do PDF 2026; **Madrid, ID 42, só é interpretado em 2026**. IDs ausentes das tabelas e -1 tornam-se `null`; circuito 0 é Melbourne e é válido. Não se deduz circuito por calendário, carro ou pacote visual.

Os três vínculos são uint32 opacos, documentados pela EA como persistentes entre saves. Zero torna-se `null` por decisão defensiva local, pois a documentação não o qualifica como vínculo confiável. Valores não zero são preservados sem inferir unicidade global, cronologia ou autenticidade. `sessionUID` permanece separado e exato; o valor técnico zero pode ser observado como na V0.2C-A, mas não comprova identidade confiável nem relação lógica. Desconhecidos não invalidam os demais campos interpretáveis. Campos fora do escopo não são validados semanticamente; diagnóstico de cabeçalho reconhecido continua sem garantir validade do payload completo.

## Pneus — V0.3A

Estruturas dos IDs 7/10 consultadas separadamente nos dois TXT oficiais em **15/11/2026**. Os PDFs confirmam **packetVersion 1**, ID 7 na página 11 e ID 10 na página 13 de ambos (numeração humana); a versão documental 1.1 de 2026 não é a versão do pacote. A frequência nominal é a selecionada no menu para ID 7 e 10 Hz para ID 10.

| Formato | Carros | Stride ID 7 | Total ID 7 | Stride ID 10 | Total ID 10 |
| --- | --- | --- | --- | --- | --- |
| 2025 | 22 | 55 | 1239 | 46 | 1041 |
| 2026 | 24 | 59 | 1445 | 46 | 1133 |

Em `CarStatusData`, antes dos compostos há cinco uint8, três float, dois uint16, dois uint8 e um uint16: `5 + 12 + 4 + 2 + 2 = 25` bytes. Seguem composto real, visual e idade (3), flag FIA (1), duas potências (8), energia armazenada (4), modo ERS (1), energias por volta (12 em 2025, 16 em 2026) e pausa de rede (1). Soma: **55/59**. A diferença é `m_ersHarvestLimitPerLap`, float adicional em 2026; nenhum campo de ERS é decodificado nesta etapa. `CarDamageData` soma quatro float de desgaste (16), três arrays de quatro uint8 (12) e dezoito uint8 restantes (18): **46**, conferido nos dois formatos. Não há trailer nesses pacotes: total = `29 + carros × stride`.

Para `i = playerCarIndex`, base do carro `B = 29 + i × stride`:

| ID | Campo | Tipo | Offset no carro | Offset absoluto |
| --- | --- | --- | --- | --- |
| 7 | m_actualTyreCompound | uint8 | 25 | B + 25 |
| 7 | m_visualTyreCompound | uint8 | 26 | B + 26 |
| 7 | m_tyresAgeLaps | uint8 | 27 | B + 27 |
| 10 | m_tyresWear[0..3] | float32 LE × 4 | 0, 4, 8, 12 | B + 0/4/8/12 |

`decodeTyres` valida formato, ID, versão, tamanho exato, tempo de sessão finito e índice (0–21/0–23) antes dessas leituras. Não infere formato pelo `gameYear`. O cabeçalho fornece identidade e timing nos offsets já documentados. Apenas o carro primário é selecionado. Campos fora do escopo não são validados semanticamente.

### Rodas, compostos e valores inválidos

A nota da EA sobre todos os arrays de rodas, junto a Motion Ex (PDF 2025 p. 15; 2026 p. 16), define **RL, RR, FL, FR**. O mapeamento explícito no contrato é:

| Índice UDP | Offset no carro | Propriedade Shared | Posição exibida |
| --- | --- | --- | --- |
| 0 | 0 | rearLeft | TE — traseiro esquerdo |
| 1 | 4 | rearRight | TD — traseiro direito |
| 2 | 8 | frontLeft | FE — dianteiro esquerdo |
| 3 | 12 | frontRight | FD — dianteiro direito |

A interface ordena **FE, FD, TE, TD**. Desgaste é percentual direto, sem multiplicar por 100 nem subtrair de 100. Não representa dano estrutural, temperatura ou aderência. Política local: uma roda com NaN, infinito ou percentual fora de **[0, 100]** rejeita o grupo inteiro daquele datagrama. Não se limita artificialmente o valor nem se renova frescor; uma amostra anterior aceita pode continuar visível até seu vencimento original. Zero, 100 e frações são válidos; o snapshot preserva o float lido e apenas a apresentação arredonda para até uma casa decimal.

Compostos reais modernos: **16=C5, 17=C4, 18=C3, 19=C2, 20=C1, 21=C0, 22=C6, 7=intermediário, 8=chuva**. Visuais: **16=macio, 17=médio, 18=duro, 7=intermediário, 8=chuva**. As tabelas coincidem nos dois anexos, mas são independentes entre real e visual. Os códigos originais uint8 permanecem no snapshot; fora dessas tabelas, inclusive códigos de outras categorias, o rótulo é `Desconhecido (código)`. Não se deduz visual de composto físico. A idade aceita todo uint8, inclusive zero; não há sentinela adicional documentada nem teto de voltas inventado.

## Sessão, publicação e frescor

`RealTelemetrySource` consome os datagramas do socket existente, somente no Main. A identidade reúne formato, índice do jogador e `sessionUID` (uint64 lido como BigInt e convertido diretamente para string decimal, sem passar por number). Pacotes desconhecidos/rejeitados não mudam identidade nem renovam frescor.

### Ordem por grupo

Velocidade/marcha, volta, contexto, composto/idade e desgaste guardam seus próprios contadores, tempos de sessão e instantes locais de recepção. O primeiro pacote de cada grupo na identidade ativa é aceito. Depois, somente um `overallFrameId` considerado mais novo substitui esse grupo. Não se comparam os frames entre IDs 1/2/6/7/10, nem entre identidades. Frequências e ordens diferentes continuam permitidas. Contexto e pneus ausentes não impedem as métricas anteriores.

A distância é `(novo - anterior) >>> 0`: o operador JavaScript converte a diferença para uint32, implementando módulo 2³². Distância entre 1 e 2³¹−1 é aceita; zero é duplicação e mantém a primeira amostra, inclusive se o payload divergir; exatamente 2³¹ é ambíguo e é rejeitado; distância maior é tratada como atraso. Isso permite `0xffffffff → 0` e rejeita um pacote pré-wrap atrasado. A regra pressupõe distância real inferior a meia faixa: não resolve saltos maiores, resets inesperados do contador na mesma identidade ou voltas completas sem observação. Não usamos tempo local para adivinhar a ordem desses casos.

`frameIdentifier`, `sessionTime` e volta podem diminuir livremente quando o contador geral avança. Essa é a distinção usada para preservar flashbacks; não há inferência por volta/tempo nem reconciliação completa entre grupos. Até chegar a próxima amostra de cada grupo, eles podem representar momentos diferentes. Um pacote repetido/atrasado/ambíguo não substitui valores, não renova frescor e não gera publicação de telemetria; continua contado no diagnóstico UDP.

### Confirmação e troca de identidade

1. Sem identidade ativa (início ou reinício), o primeiro pacote decodificado válido assume imediatamente.
2. Identidade diferente fica candidata, com no máximo uma amostra por grupo e sem publicação. É necessário observar **dois pacotes do mesmo grupo com avanço do contador geral**, dentro de **1000 ms** desde o primeiro pacote candidato. Qualquer um dos IDs 1/2/6/7/10 pode confirmar sozinho. Duplicações, atrasos e ambiguidade não confirmam nem estendem essa janela. No limite exato, uma nova candidatura começa. Contradições entre campos conhecidos de contexto da candidata descartam essa candidatura; uma sequência posterior pode iniciar outra.
3. Uma amostra aceita da identidade ativa cancela a candidatura. Uma terceira identidade substitui a candidata. Pacotes rejeitados pelo parser ou de UIDs bloqueados não participam. Apenas tráfego descartado da identidade ativa não cancela a candidatura.
4. Confirmada a candidata, os cinco grupos ativos e referências de contexto anteriores são limpos antes de aplicar suas amostras, preservando os instantes originais de recepção e referências conhecidas da candidata. Nenhum valor antigo é combinado com a nova identidade; a publicação só ocorre após essa transição síncrona. `identityRevision` incrementa em cada troca técnica confirmada, inclusive formato/carro; não é um contador de fins de semana.
5. Quando muda o UID, o UID anterior entra em uma fila limitada aos **8 últimos UIDs substituídos**, em memória. Qualquer pacote desses UIDs é ignorado pela fonte real, inclusive após silêncio. Trocar apenas formato/carro não aposenta o UID: é possível alternar 2025 → 2026 → 2025 ou mudar de jogador e voltar, sempre com confirmação.

Os limiares são escolhas locais, não parâmetros prescritos pela EA. A confirmação reduz troca por pacote isolado, e a fila bloqueia inclusive rajadas de sessões recentemente substituídas. Isso não autentica uma sessão nova: uma rajada coerente de identidade desconhecida, de formato/carro anterior sob o mesmo UID, ou de UID já removido da fila ainda pode assumir. A primeira identidade após início também pode vir de pacote atrasado. Reutilizar um UID ainda retido (por exemplo, se uma retomada de save fizer isso) é bloqueado até sua remoção da fila ou reinício do receptor/fonte; esse comportamento do jogo ainda exige validação. Não há timeout que apague essa proteção em silêncio nem histórico persistente.

### Identidade lógica, contradições e retomadas

O contrato Shared separa `identity` (sessionUID em `sessionId`, formato e jogador) de `context` (tipo, circuito, vínculos e timing do ID 1). Vínculos iguais entre UIDs novos permitem observar a referência lógica fornecida pelo jogo, mas não dispensam confirmação, não recuperam métricas anteriores nem criam histórico. Mudança de UID não implica mudança de fim de semana. Não há agrupamento automático entre identidades nem comparação de contadores de transmissões distintas.

Cada identidade ativa guarda, internamente, a primeira referência conhecida de cada um dos cinco campos de contexto. Pacote mais novo que contradiga uma referência conhecida torna o contexto **indisponível até uma troca técnica confirmada ou reinício**. A mesma regra de coerência vale durante a candidatura. Um campo `null` não contradiz nem apaga a referência interna; também não é preenchido com o valor anterior no snapshot. Referências da candidata sobrevivem à confirmação mesmo quando a última amostra contém `null`.

Essa decisão conservadora evita associar as métricas a uma identidade lógica contraditória. As métricas continuam seguindo a identidade técnica e sua própria ordem; o contexto contraditório não é publicado. Não tentamos inferir uma nova sessão por troca de tipo/circuito/vínculo sob o mesmo UID. Uma mudança legítima desses campos com identidade técnica invariável ficará indisponível: é limitação explícita, a validar no jogo. O bloqueio por conflito não autentica a primeira referência recebida.

**A fila dos oito UIDs não foi relaxada.** Um pacote antigo também pode conter os mesmos vínculos persistentes do save, ou vínculos distintos. Nem igualdade, diferença, rajada crescente ou silêncio oferecem prova de retomada válida de um UID bloqueado. Retomada com UID novo segue a confirmação normal, mesmo com contador menor; retomada na mesma identidade aceita avanço por grupo. Reset/ambiguidade mantém a comparação modular existente, sem recuperação automática. Reiniciar o aplicativo limpa a proteção e as referências, mas não comprova que o primeiro pacote seguinte seja novo.

Estados mínimos de contexto:

- `unidentified`: nenhum ID 1 aceito nesta identidade ou nenhum dos cinco campos interpretável na amostra fresca; interface aguarda contexto.
- `identified`: ID 1 fresco e sem conflito, com pelo menos um campo interpretável. Os demais permanecem `null`; isso não certifica identificação lógica completa.
- `unavailable`: contexto venceu ou houve contradição; `context` é `null`. Expiração pode se recuperar com avanço coerente, enquanto contradição exige troca técnica/reinício.
- A transição confirmada é representada pela mudança de `identity` e incremento de `identityRevision`, independentemente do estado de contexto. A revisão inicia em zero e zera com o ciclo de vida; não há evento passageiro, relógio de progressão nem histórico.

### Frescor, interrupção e ciclo de vida

Cada grupo vence em **3000 ms**, medidos com `performance.now()` (relógio monotônico local, independente do tempo do jogo). `getSnapshot()` calcula a validade no instante da consulta. O timer publica no máximo a cada **100 ms (10 Hz)** durante a recepção, inclusive transições de expiração sem tráfego. Rajadas são coalescidas no último estado, sem reter buffers. Início/parada e inscrições/pedidos de estado inicial são imediatos.

Estados dos grupos de métricas: `waiting` (nunca recebido nesta identidade), `fresh` (idade < 3000 ms), `stale` (idade ≥ 3000 ms). Snapshot contém null para grupos ausentes/vencidos. Estado geral das métricas, preservado: `stale` se algum dos dois grupos venceu, `receiving` se existe métrica fresca e nenhuma vencida, `waiting` se nenhuma métrica chegou, `stopped` após parada. Um grupo fresco continua visível mesmo se o outro venceu; se apenas um chegou, a interface informa recepção parcial. Contexto tem os estados acima e expira independentemente em 3000 ms. Receber só ID 1 não renova métricas; receber só IDs 2/6 não renova contexto.

O início/reinício, erro ou parada do receptor invalida os dados e limpa candidatura, referências de ordem e fila de UIDs. Encerrar a fonte cancela as duas inscrições e o timer. Cancelamentos individuais são idempotentes. Silêncio/diagnóstico `idle`, expiração, pausa e Alt+Tab não limpam identidade nem referências de ordem. A retomada aceita a próxima amostra com avanço em cada grupo. Se o jogo enviar somente o mesmo contador durante uma pausa, as métricas vencem mesmo com tráfego no diagnóstico; chegada recente não comprova medição nova. Silêncio UDP não significa pausa, e tempo local não produz progresso de corrida. Recarregar o Renderer mantém estado e socket; o Preload instala o listener antes de solicitar o snapshot, com remetente/frame validados no Main.

Os pneus publicam `tyreStatus`/`tyreWear` e seus estados `tyreStatusFreshness`/`tyreWearFreshness`, usando `waiting`, `fresh` e `stale`. Cada grupo tem expiração independente de 3000 ms; campos ausentes/vencidos são `null`. O estado geral existente continua descrevendo apenas velocidade/marcha e volta. O painel de pneus descreve sua própria disponibilidade. Contexto ausente ou contraditório não bloqueia os grupos de pneus na mesma identidade técnica. A memória continua limitada: cinco grupos ativos, até cinco pacotes candidatos decodificados e a proteção existente de oito UIDs; sem reter datagramas.

Idade e desgaste podem diminuir com avanço do contador geral, tanto em flashbacks quanto em trocas de pneus. Não há monotonicidade imposta aos valores nem inferência automática de pit stop/stint. Durante uma transição, grupos frescos da mesma identidade podem momentaneamente representar instantes diferentes; a entrega não implementa sincronização entre pacotes nem reconciliação completa de flashbacks.

## Fixtures

`tests/fixtures/f1-header.ts` constrói cabeçalhos sintéticos com esses offsets, sessão fictícia 123, versão de pacote 1, tempo 10,5 e frame 100. O smoke test constrói uma fixture equivalente de formato 2026/ID 16. Não representam payloads completos nem capturas reais. Variantes curtas, IDs inválidos e números não finitos exercitam a rejeição segura.

`tests/fixtures/f1-telemetry.ts` e o smoke constroem também pacotes completos IDs 2/6, com comprimentos, strides e offsets acima. Frame comum e contador geral são configuráveis independentemente, inclusive para flashbacks e wraparound sintéticos. Carros não selecionados recebem valores distintos, incluindo testes no último índice. Os construtores não importam constantes do parser, para detectar divergências. Campos fora do escopo são sintéticos, em geral zerados. Nenhuma fixture é evidência de comparação com o HUD real. Resultados e roteiro manual da política temporal: [Validação V0.2C-A](validation-v0.2c-a.md).

`tests/fixtures/f1-session.ts` e o smoke acrescentam ID 1 completo nos dois formatos, sem importar offsets do decoder. Os testes cobrem vínculos e desconhecidos, truncamentos, conflitos, transições e preservação de referências da candidata, ordem, flashbacks, silêncio, retomadas, ausência de contexto, ciclos de vida e socket único. Evidências e roteiro manual: [Validação V0.2C-B](validation-v0.2c-b.md).

`tests/fixtures/f1-tyres.ts` e o smoke constroem IDs 7/10 completos para ambos os formatos sem importar constantes do parser. As rodas têm valores distintos, inclusive do array de dano, e os demais carros têm outros valores. Os testes incluem limites, desconhecidos, último índice, truncamentos, ordem, trocas de pneus, identidade, expiração independente e recursos. Resultados e roteiro manual: [Validação V0.3A](validation-v0.3a.md). Nenhuma dessas fixtures é captura do jogo real.
