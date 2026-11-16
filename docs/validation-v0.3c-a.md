# Validação V0.3C-A — posição e diferenças de corrida

Implementação e verificações realizadas em **15/11/2026**. Todas as entradas automatizadas são **sintéticas**, inclusive nos testes com sockets locais e Electron real. O agente não executou o F1 25. A validação manual dos sete cenários foi aprovada conforme relato do usuário registrado abaixo. A revisão técnica independente permanece pendente, após a publicação da branch e antes de qualquer autorização de merge.

## Preparação e escopo

AGENTS.md lido integralmente. O GitHub confirmou o [PR #8](https://github.com/andre-rossi-dev/rossi-pitwall/pull/8) integrado à `main`, merge commit `24540cd9f48de89b4cff9ea1e6581faf140502f8`. Após `git fetch origin`, `main` e `origin/main` coincidiam nesse commit, comparação 0/0 e árvore limpa. Foi criada a branch **feat/v0.3c-race-position-gaps**. Não houve commit, push ou merge durante a implementação; a autorização posterior para commit e publicação exclusiva da branch está registrada abaixo.

A entrega amplia a leitura existente do jogador no Lap Data (ID 2), com posição e diferenças fornecidas pelo jogo para carro à frente/líder, formatos 2025/2026. Acrescenta um painel compacto exclusivo de UDP REAL. Preserva a volta, os painéis anteriores, simulador, receptor único, contratos IPC restritos e segurança Electron. Não implementa grid completo, identificação de adversários, gap atrás, cálculos próprios, estratégias, condições de pista, voz ou overlay. Nenhuma dependência foi adicionada.

## Referências, campos e offsets

Consultados diretamente os anexos oficiais EA [TXT 2025](https://forums.ea.com/t5/s/tghpe58374/attachments/tghpe58374/f1-games-game-info-hub-en/61/5/F1%2025%20Telemetry%20Output%20Structures.txt), [TXT 2026](https://forums.ea.com/t5/s/tghpe58374/attachments/tghpe58374/f1-games-game-info-hub-en/61/8/2026%20Season%20Pack%20Telemetry%20Output%20Structures%20%281%29.txt), [PDF 2025](https://forums.ea.com/t5/s/tghpe58374/attachments/tghpe58374/f1-games-game-info-hub-en/61/4/Data%20Output%20from%20F1%2025%20v3.pdf) e [PDF 2026](https://forums.ea.com/t5/s/tghpe58374/attachments/tghpe58374/f1-games-game-info-hub-en/61/9/Data%20Output%20from%20F1%2025%202026%20Season%20Pack%20%281%29.pdf). Lap Data: PDF 2025 p. 5–6 e 2026 p. 6, numeração humana; **packetVersion 1**. A versão documental 1.1 do PDF 2026 não altera a versão do pacote.

| Formato | Carros / índices | Stride | Tamanho completo |
| --- | --- | --- | --- |
| 2025 | 22 / 0–21 | 57 | 29 + 22 × 57 + 2 = **1285** |
| 2026 | 24 / 0–23 | 57 | 29 + 24 × 57 + 2 = **1399** |

Base do jogador `B = 29 + playerCarIndex × 57`; layout packed, inteiros multibyte little-endian. Offsets iguais nos dois formatos:

| Campo | Offset relativo | Tipo / unidade | Propriedade em RealLap |
| --- | --- | --- | --- |
| m_deltaToCarInFrontMSPart | 14 | uint16 / parcela em ms | deltaToCarInFrontMSPart |
| m_deltaToCarInFrontMinutesPart | 16 | uint8 / minutos inteiros | deltaToCarInFrontMinutesPart |
| m_deltaToRaceLeaderMSPart | 17 | uint16 / parcela em ms | deltaToRaceLeaderMSPart |
| m_deltaToRaceLeaderMinutesPart | 19 | uint8 / minutos inteiros | deltaToRaceLeaderMinutesPart |
| m_carPosition | 32 | uint8 / posição de corrida | carPosition |
| m_currentLapNum | 33 | uint8 / volta | number, preservado |
| m_resultStatus | 45 | uint8 / estado do resultado | resultStatus |

Offset absoluto é `B + relativo`. A derivação e as políticas estão em [Protocolo UDP](udp-protocol.md#posição-e-diferenças--v03c-a). Composição dimensional: **minutos × 60.000 + parcela de ms**, sem cálculo próprio de intervalo. O estado conserva as duas parcelas inteiras exatas, inclusive valores ambíguos; somente a apresentação divide ms por 1000. Exemplos: `0,001 s`, `59,999 s`, `1 min 0,000 s`, `1 min 2,345 s`. Não há arredondamento prematuro.

## Decisões de implementação e apresentação

Foi ampliado `RealLap`, pois todos os campos pertencem ao mesmo datagrama e timing. Não há vantagem em criar um grupo de corrida separado. `decodeTelemetry` mantém a seleção por `packetFormat`, índice primário e validações existentes de cabeçalho, versão, comprimento exato e índice antes de qualquer leitura. Posição zero/desconhecida não rejeita a volta válida nem reaproveita a posição anterior.

O painel reutiliza a inscrição React existente e os estilos compactos de combustível/ERS. Uma função pura no Renderer reúne os critérios de disponibilidade e formatação, permitindo testar a semântica sem abrir Electron. Nenhum cálculo ou validação de confiança foi transferido do Main para autorizar operações privilegiadas: os critérios do Renderer servem apenas para apresentação.

| Condição | Apresentação |
| --- | --- |
| Lap Data ausente / vencido | Todos `—`; aguardando / desatualizados |
| Contexto ausente, desconhecido, vencido ou contraditório | Todos `—`; contexto de corrida indisponível |
| Treinos, classificações, classificações sprint e contrarrelógio | Todos `—`; disponível somente em corrida |
| Corrida (sessionType 15/16/17), resultStatus 2 e posição reconhecida | `P1` até `P22`/`P24`, conforme formato |
| resultStatus diferente de 2 | Todos `—`; jogador sem estado ativo de corrida |
| Posição zero ou acima do limite de carros | Todos `—`; posição indisponível |
| P1 | Posição visível; dois gaps `—`; líder / diferenças não aplicáveis |
| Posição maior que 1, gap positivo e parcela ms < 60.000 | Diferença recebida, separada em segundos/minutos |
| Total zero ou parcela ms ≥ 60.000 | `—` apenas nesse delta; posição e outro delta elegíveis permanecem |

Esses filtros são **políticas locais conservadoras**, não regras universais atribuídas à EA. `m_carPosition` é descrito como posição de corrida; os anexos não estabelecem uma equivalência confiável com classificação por tempo ou ordem física em outras sessões. Portanto não exibimos Pn nesses modos. Os apêndices enumeram Race/Race 2/Race 3 nos tipos 15/16/17; não deduzimos tipo pelo nome visual do evento.

Os FAQs oficiais recomendam consultar resultStatus para identificar dados inválidos/inativos (2025 p. 20 / 2026 p. 22), além de participantes ativos, que não são interpretados nesta entrega. Lemos somente o resultStatus do jogador, no próprio ID 2. A regra visual exige explicitamente ativo (2), ocultando também resultados finalizados, abandonos e desclassificações para não apresentá-los como corrida atual. Não é um parser de classificação final, nem uma verificação completa dos participantes.

Zero não comprova empate, ausência de adversário ou liderança. Para P1 não inventamos diferença zero e não confundimos um retardatário fisicamente à frente com o próximo colocado. A limitação de parcela ms a menos de 60.000 é uma decisão visual de representação canônica; os anexos não detalham sentinelas/overflow para todos os modos. O bruto uint16 é preservado, assim como todo uint8 de minutos, sem considerar 255 uma sentinela inventada. Minutos positivos com parcela zero são elegíveis.

Pit stops, Safety Car, retardatários, voltas diferentes, largada e transições podem afetar o significado e a atualização desses deltas. Esta versão não detecta tais situações nem as corrige. Valores positivos elegíveis são apenas os deltas informados pelo jogo, sem promessa de intervalo contínuo/instantâneo ou correspondência universal com cada tela do HUD. Não se calcula distância, velocidade relativa, gap próprio, voltas de atraso ou identidade de oponente.

## Integridade temporal e preservação

`RealTelemetrySource` permaneceu inalterada: sua atribuição de `RealLap` aceita, congela e publica conjuntamente volta/posição/parcelas/resultStatus. Um pacote novo com campos ambíguos substitui todo o objeto; não mistura medições antigas com novas. Mantidos:

- Ordem por grupo e identidade usando diferença modular uint32 de `overallFrameIdentifier`; somente distâncias de 1 a 2³¹−1 avançam. Duplicata, atraso e meia faixa não substituem nem renovam frescor; wraparound permitido.
- Flashbacks de frame, tempo, volta, posição e deltas. Valores podem aumentar ou diminuir sem monotonicidade imposta. Não há reconciliação completa entre IDs.
- Identidade UID/formato/jogador, confirmação por avanço no mesmo grupo dentro de 1000 ms e proteção dos oito últimos UIDs substituídos. Novos campos do ID 2 não contam como confirmações adicionais.
- Limpeza conjunta dos grupos em transição confirmada; cinco grupos no total. Contexto da identidade antiga não é usado para habilitar o painel novo.
- `lapFreshness` único e expiração exata em **3000 ms**; publicação até 10 Hz. Outros IDs não renovam ID 2. O ID 1 expira independentemente: sua ausência oculta a apresentação de corrida, mas não impede a leitura/exibição de volta.
- Pausa/silêncio/idle não limpam identidade nem comprovam estado de pausa. Retomada requer avanço. Repetições após silêncio não recuperam dados vencidos.
- Início/parada idempotentes, cancelamentos individuais, fechamento dos recursos, um socket UDP no Main, Preload restrito, Renderer sem Node e isolamento/sandbox/CSP existentes.

Não houve alteração arquitetural permanente que justificasse modificar AGENTS.md. Main/index, Preload, receptor, simulador e painéis anteriores ficaram inalterados; App apenas acrescenta o painel e atualiza o identificador visual da entrega.

## Verificações efetivamente executadas

Os resultados abaixo pertencem à execução de implementação já realizada. Nesta retomada para publicação houve somente atualização documental; suíte, typecheck, build e smokes não foram repetidos. As saídas e códigos de resultado anteriores permanecem registrados nesta conversa.

| Comando / verificação | Resultado da execução de implementação |
| --- | --- |
| Testes específicos de parser, apresentação e fonte de corrida | **192 aprovados**, 3 arquivos |
| `npm run typecheck` | Aprovado, código 0 |
| `npm run test` | **464 aprovados**, 13 arquivos, código 0 |
| `npm run build` | Aprovado, código 0; Main, Preload CommonJS e Renderer |
| `node --check scripts/smoke.cjs` | Aprovado, código 0 |
| Smoke Electron `receive` | **SMOKE OK (receive)**, código 0 |
| Smoke Electron `occupied` | **SMOKE OK (occupied)**, código 0 |
| Smoke Electron `invalid` | **SMOKE OK (invalid)**, código 0 |
| Capturas do novo painel em 980×660 / 640×500 | Inspecionadas; painel legível após rolagem, sem corte ou excesso horizontal, inclusive delta longo |
| Revisão do diff, arquivos novos e whitespace | Concluída, sem erros |
| F1 25 real / revisão técnica independente | Não executados pelo agente; relato manual posterior registrado abaixo; revisão independente pendente |
| Smoke com servidor de desenvolvimento | Não executado; integração utiliza build de produção |

São **148 casos adicionais** aos 316 anteriores: 40 no parser existente, 80 de apresentação e 28 da fonte. Cobrem ambos os formatos, seleção do primeiro/intermediário/último jogador, posição válida/zero/desconhecida, resultStatus, parcelas pequenas/grandes/minutos/zero/não canônicas e diferenças distintas. Os testes existentes continuam verificando todos os truncamentos, tamanho extra/incorreto, versão, índice, formato, tempo não finito e seleção independente de gameYear.

Os testes da fonte cobrem publicação conjunta e imutabilidade, rejeição sem renovação, wraparound/meia faixa, posições em ambas as direções, retrocessos por flashback, expiração no limite exato, ausência de ID 2 com outros grupos ativos, silêncio/retomada, contexto vencido/conflitante, troca UID/formato/jogador, confirmação por outro grupo, UID aposentado, erros/parada e cleanup. A suíte anterior preserva pneus/combustível/ERS, simulador, receptor e Preload.

O smoke envia datagramas sintéticos completos pela porta UDP efêmera e confere valores no DOM, formatos 2025/2026, estado bruto preservado em recarga, liderança, zero/invalidade, exclusão de treino e simulador, flashback, expiração mesmo com outros IDs frescos e retomada. Mantém as verificações anteriores de segurança Electron, API, cancelamento IPC e painéis. O limite global passou de 40 para 60 segundos para acomodar os cenários adicionais de expiração; não há retry automático ocultando falhas. As novas imagens `race-position-initial.png` e `race-position-minimum.png` estão no diretório ignorado `.smoke-profile/`, sem capturas do jogo.

Nenhuma falha de teste ou `UnknownVizError` ocorreu nas três execuções de smoke da implementação. A intermitência gráfica histórica registrada na [V0.2C-B](validation-v0.2c-b.md#falhas-gráficas-e-limitações-da-evidência) continua sem causa/resolução definitiva comprovada; estas aprovações não a encerram. O primeiro fetch falhou por permissão de escrita em `.git/FETCH_HEAD`; foi repetido com aprovação e concluído. A criação da branch e os testes gráficos também usaram a permissão exigida pelo ambiente.

## Validação manual com F1 25 real — relato do usuário

Relato recebido em **15/11/2026**. O usuário concluiu a validação da V0.3C-A com o F1 25 real e aprovou os sete cenários abaixo. Não observou travamentos, congelamentos ou comportamento anormal aparente. São observações funcionais do usuário, separadas das evidências sintéticas e automatizadas; o agente não executou o jogo nem realizou medições próprias desses resultados.

| Cenário | Resultado relatado |
| --- | --- |
| Posição e gaps na corrida | Aprovado |
| Ultrapassagens e perda de posição | Aprovado |
| Liderança | Aprovado |
| Flashbacks | Aprovado |
| Pausa e interrupção UDP | Aprovado |
| Formatos UDP 2025 e 2026 | Aprovado |
| Outros modos, interface e simulador | Aprovado |

### Cobertura não detalhada e limitações preservadas

A aprovação não constitui calibração numérica universal nem comprova equivalência contínua com o HUD, latência, sincronização perfeita ou ausência de perdas. O relato não discrimina cada combinação de formato, modo, valor-limite e estado do jogador, nem confirma todos os passos do roteiro abaixo. Não foram fornecidas medições específicas para diferenças maiores que um minuto, parcelas não canônicas, zeros ambíguos, estados de resultado ou quantidade de participantes.

Pit stops, Safety Car, retardatários e diferenças entre voltas não receberam resultados específicos no relato. Não é possível afirmar cobertura individual ou resolução de ambiguidades nesses cenários. Permanecem a política conservadora de apresentação e a ausência de interpretação dessas condições. Os intervalos são fornecidos pelo jogo; o Pitwall não calcula gaps próprios nem infere voltas de atraso ou intervalos físicos contínuos.

Flashbacks e pausa/interrupção foram aprovados nos cenários observados, mas isso não demonstra reconciliação histórica completa. Não há histórico persistente. Os grupos UDP continuam independentes; confirmação de identidade, proteção limitada dos oito UIDs substituídos e rejeição de resets/ordens ambíguas permanecem inalteradas. Retomada de save com UID retido, reset do contador e meia faixa não receberam investigação específica relatada; não se declara recuperação universal desses casos.

A ausência de anomalias aparentes não demonstra resolução definitiva da intermitência histórica `UnknownVizError`, cuja causa permanece não comprovada. A revisão técnica independente dos arquivos publicados continua pendente, antes de qualquer autorização de merge.

## Revisão para commit e publicação da branch

Retomada concluída em **16/11/2026**, preservando a implementação e o registro manual salvos antes da interrupção. O relato inicial de 15/11 foi reafirmado pelo usuário na retomada, sem novos resultados ou medições. A atualização pendente do README foi concluída para refletir a aprovação manual e manter a revisão independente como pendente.

Após o relato, o usuário autorizou o commit `feat: adiciona posição e diferenças de corrida via UDP` e o push **exclusivamente de `feat/v0.3c-race-position-gaps`**, sem merge na main, exclusão de branches ou avanço para V0.3C-B.

Nesta retomada, AGENTS.md foi relido e foram confirmados a branch solicitada, o HEAD de base `24540cd`, os oito arquivos rastreados modificados, os cinco arquivos novos e o staging inicialmente vazio. A revisão abrangeu os 13 arquivos, verificando consistência entre parser, contratos Shared, política visual, fixtures, testes, smoke e documentação. Nenhuma falha técnica relevante ou alteração fora do escopo foi identificada.

Somente este documento e o README foram atualizados nesta etapa. Código, contratos, testes e smoke permaneceram como na implementação verificada. Os **464 testes aprovados**, typecheck, build, três smokes e inspeções gráficas mantêm sua origem na execução anterior; não foram repetidos desnecessariamente.

A inspeção do conteúdo e a busca por padrões comuns de credenciais não identificaram segredos. A seleção contém apenas código, testes e documentação da entrega; dependências, build, capturas e perfil gráfico permanecem ignorados. `git diff --check` e a conferência individual dos arquivos novos não apontaram erros de whitespace. A revisão independente será feita sobre a branch publicada, sem autorização de merge nesta tarefa.

## Arquivos da entrega

Modificados: `src/shared/realTelemetry.ts`, `src/main/udp/decodeTelemetry.ts`, `src/renderer/src/App.tsx`, `tests/fixtures/f1-telemetry.ts`, `tests/real-telemetry-parser.test.ts`, `scripts/smoke.cjs`, `README.md` e `docs/udp-protocol.md`.

Criados: `src/renderer/src/RacePositionPanel.tsx`, `src/renderer/src/racePosition.ts`, `tests/race-position-presentation.test.ts`, `tests/race-position-source.test.ts` e este documento. Sem dependências, artefatos de build ou capturas adicionados ao controle de versão.

## Roteiro de validação manual com F1 25 real

Roteiro disponível para repetição e ampliação da validação. O relato acima aprova sete cenários gerais, sem confirmar cada passo ou caso-limite abaixo. O agente não executou este roteiro. Registrar formato observado, build do jogo, sessão, índice do jogador, cenário, valores no HUD/Pitwall e divergências. Repetir nos dois formatos; não usar pacote visual como prova do protocolo.

1. Executar `npm run build` e `npm start`. Configurar UDP local conforme README (`127.0.0.1`, porta 20777 por padrão) e selecionar UDP REAL. Sem jogo, o painel deve aguardar dados com `—`.
2. Em corrida, com jogador ativo e contexto identificado, comparar Pn e os dois deltas separadamente com as indicações disponíveis no HUD. Observar diferença pequena, diferença maior que um minuto e valores distintos para líder/carro à frente. Não exigir sincronização de frames com o HUD nem tratar screenshots como calibração universal.
3. Assumir liderança e depois perder posição: P1 deve manter ambos os gaps indisponíveis; fora da liderança, diferenças elegíveis devem retornar. Observar ultrapassagens/perdas de posição sem travamento por monotonicidade. Se o jogo informar zero, conferir `—`, sem inferir empate.
4. Fazer flashbacks para instantes e voltas anteriores. Conferir volta, posição e diferenças acompanhando as novas amostras aceitas, inclusive reduções. Verificar pneus, combustível e ERS preservados, lembrando que grupos diferentes podem representar instantes distintos.
5. Observar pit stops, retardatários, voltas diferentes e Safety Car quando ocorrerem. Registrar divergências/ambiguidade; o painel não detecta essas condições, não converte tempos em voltas de atraso nem promete um intervalo físico contínuo. Não tratar um número positivo como confirmação dessas interpretações.
6. Pausar, usar Alt+Tab e interromper explicitamente UDP por mais de três segundos. Pausa pode manter tráfego: com contador repetido, o grupo vence; se o contador avança, pode permanecer fresco. Após interrupção, conferir `—` e retomar. Silêncio não deve ser rotulado automaticamente como pausa.
7. Trocar sessão e formato 2025/2026; confirmar limpeza de dados anteriores e recuperação após nova identidade/contexto. Entrar em treinos/classificações/contrarrelógio: novo painel numérico indisponível, volta e painéis anteriores preservados. Ao finalizar/abandonar, conferir que resultados não ativos não aparecem como corrida ativa. Contexto contraditório sob o mesmo UID mantém indisponibilidade conforme política anterior.
8. Alternar SIMULAÇÃO/UDP REAL: o painel só deve existir no modo real, sem valores fictícios. Recarregar a página e conferir continuidade do Main. Verificar rolagem/legibilidade em 980×660 e 640×500. Fechar/reabrir para conferir encerramento e liberação da porta.

A validação manual foi aprovada nos limites do relato acima. Commit e publicação da branch foram autorizados com a mensagem `feat: adiciona posição e diferenças de corrida via UDP`; a revisão técnica independente permanece necessária antes de autorizar merge na main.
