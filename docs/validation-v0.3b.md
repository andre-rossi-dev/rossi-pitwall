# Validação V0.3B — combustível e ERS reais

Implementação e verificações realizadas em **15/11/2026**. Conteúdo dos testes automatizados é **sintético**, inclusive quando percorre sockets locais e Electron real. O agente não executou o F1 25. A validação manual dos sete cenários foi aprovada conforme relato do usuário registrado abaixo. A revisão técnica independente permanece pendente e ocorrerá após a publicação da branch, antes de qualquer autorização de merge.

## Preparação e escopo

AGENTS.md foi lido integralmente. O GitHub confirmou o [PR #7](https://github.com/andre-rossi-dev/rossi-pitwall/pull/7) integrado à `main`, com merge commit `df10ec1352a5a6a9b632b695a1a3c3376459a9c5`. Após `git fetch origin`, `main` e `origin/main` apontavam para esse mesmo commit, com árvore limpa. Foi criada a branch local **feat/v0.3b-fuel-ers**. Não houve commit, push ou merge durante a implementação e a retomada; a autorização posterior para commit e publicação da branch está registrada abaixo.

Foram acrescentados dois painéis de observação exclusivos de UDP REAL: combustível atual/capacidade, estimativa de voltas do jogo e energias/modo ERS. Preservados pneus, velocidade/marcha/volta, contexto, simulador, receptor único, política temporal, IPC restrito, cancelamentos e segurança Electron. Não há cálculo de consumo, previsão própria, percentual de bateria, estratégia, voz, overlay, histórico, dados de adversários ou parser do ID 16. Não há novas dependências.

## Campos, offsets e diferenças dos protocolos

Os TXT oficiais de [2025](https://forums.ea.com/t5/s/tghpe58374/attachments/tghpe58374/f1-games-game-info-hub-en/61/5/F1%2025%20Telemetry%20Output%20Structures.txt) e [2026](https://forums.ea.com/t5/s/tghpe58374/attachments/tghpe58374/f1-games-game-info-hub-en/61/8/2026%20Season%20Pack%20Telemetry%20Output%20Structures%20%281%29.txt) foram consultados separadamente, junto dos PDFs referenciados no [protocolo](udp-protocol.md#combustível-e-ers--v03b). ID 7, **packetVersion 1**, cabeçalho de 29 bytes, estrutura packed little-endian, sem trailer. A versão documental 1.1 de 2026 não é a versão do pacote.

| Formato | Carros / índices | Stride do carro | Total ID 7 |
| --- | --- | --- | --- |
| 2025 | 22 / 0–21 | 55 bytes | 1239 bytes |
| 2026 | 24 / 0–23 | 59 bytes | 1445 bytes |

Base `B = 29 + playerCarIndex × stride`. Somente o jogador primário é selecionado. Os offsets abaixo são relativos a B; `packetFormat`, e não `gameYear` nem pacote visual, escolhe o layout.

| Campo | Tipo | 2025 | 2026 |
| --- | --- | --- | --- |
| m_fuelInTank | float32 | 5 | 5 |
| m_fuelCapacity | float32 | 9 | 9 |
| m_fuelRemainingLaps | float32 | 13 | 13 |
| m_actualTyreCompound / m_visualTyreCompound / m_tyresAgeLaps | uint8 cada | 25 / 26 / 27 | 25 / 26 / 27 |
| m_ersStoreEnergy | float32 | 37 | 37 |
| m_ersDeployMode | uint8 | 41 | 41 |
| m_ersHarvestedThisLapMGUK | float32 | 42 | 42 |
| m_ersHarvestedThisLapMGUH | float32 | 46 | 46 |
| m_ersHarvestLimitPerLap | float32 | ausente | 50 |
| m_ersDeployedThisLap | float32 | **50** | **54** |

O limite adicional em 2026 desloca a energia utilizada; não basta trocar o total do pacote. `networkPaused` encerra o carro em 54/58, sem interpretação nesta entrega. O PDF 2026 usa a grafia `m_ersHarvestedLimitPerLap`, enquanto o TXT usa `m_ersHarvestLimitPerLap`; o campo e sua posição coincidem. Modos: 0 Nenhum, 1 Médio, 2 Hotlap; **3 Overtake em 2025 / Boost em 2026**. Demais códigos permanecem brutos no estado e aparecem como indisponíveis na interface.

## Estrutura, unidades e validação de valores

- `RealFuel`: `inTank`, `capacity`, `remainingLaps`, todos `number | null`. Floats aceitos permanecem sem arredondamento. A EA descreve massa/capacidade, mas os anexos não explicitam kg; a apresentação em **kg** é uma convenção a validar com o jogo/addons, sem converter o float para outra escala.
- `remainingLaps`: valor assinado do MFD, identificado como estimativa do jogo. Negativos finitos são preservados, pois podem representar déficit/saldo de voltas. A documentação oficial não impõe faixa positiva nem detalha a semântica contextual em todos os modos. Não o tratamos como autonomia absoluta, não somamos voltas restantes da corrida e não calculamos previsão própria.
- `RealErs`: `storeEnergyJ`, `deployMode`, `harvestedThisLapMGUKJ`, `harvestedThisLapMGUHJ`, `deployedThisLapJ`, `harvestLimitPerLapJ`. O código do modo mantém todo uint8; energias são `number | null`. A EA explicita joules para energia armazenada; usar J para os demais campos energéticos do mesmo bloco é uma inferência consistente, documentada e sujeita à validação real.
- Conversão apenas visual: **MJ = J / 1.000.000**, até três casas decimais, resolução de 1 kJ. Massa e estimativa MFD têm até duas casas decimais. Não há capacidade de bateria ou percentual presumido.
- Não finitos viram `null` por campo. Massa/capacidade/energias negativas também; `remainingLaps` negativo permanece válido. Zero é válido, inclusive capacidade/limite. Nenhum teto regulamentar, comparação cruzada com capacidade ou monotonicidade dos valores é imposto. Reduções de contadores por volta são legítimas.
- MGU-H consta nos dois protocolos e é exibido quando finito e não negativo, inclusive zero. O ano/formato não comprova presença física ou disponibilidade do sistema; zero não é uma sentinela inventada. Limite de recuperação fica `null` em 2025 e quando inválido em 2026. A interface só mostra sua linha no formato 2026.

Não se interpreta o modo do ID 7 como botão manual de Boost, Overtake Mode do ID 16 ou Straight Line Mode. O formato não determina a física do carro: o usuário pode usar pacote visual e addons energéticos. A aplicação observa os campos recebidos e não altera o jogo.

## Integridade temporal e arquitetura

O parser existente `decodeTyres` continua responsável pelos IDs 7/10. A variante `tyreStatus` mantém `data: RealTyreStatus` e passa a incluir os contratos separados `fuel` e `ers`. O nome histórico foi preservado para limitar mudanças; ele representa a aceitação do **ID 7 inteiro**, não três fluxos. Nenhum novo parser do mesmo payload, socket, canal IPC, assinatura de API pública ou timer foi criado.

Internamente, `ReceivedCarStatus` reúne os três domínios e um instante de recepção. Uma única decisão de identidade/ordem e atribuição síncrona atualiza todos. `RealTelemetrySnapshot` expõe `fuel`/`ers` ao lado de `tyreStatus`; todos usam a mesma identidade, timing em `tyreStatus` e `tyreStatusFreshness`. Objetos aceitos são congelados. Campos inválidos do pacote novo substituem o valor anterior por `null`, sem fazer pneus válidos desaparecerem nem reaproveitar amostras antigas. Um ID 7 estruturalmente válido renova o grupo; isso não declara válidos os campos marcados `null`. Rejeições estruturais não renovam nada. O ID 10 mantém sua política anterior de rejeição atômica das quatro rodas.

Mantidas as regras existentes:

- Cada ID é ordenado por `overallFrameIdentifier`; `(novo - anterior) >>> 0` converte a diferença para uint32. Aceita distâncias de 1 a 2³¹−1; duplicações, atrasos e meia faixa ambígua são rejeitados, sem renovar frescor. Wraparound é aceito.
- Frame comum, tempo, volta, combustível e energias podem retroceder quando o contador geral avança. Não há reconciliação completa entre IDs nem histórico.
- Identidade técnica é UID/formato/jogador. Transição exige avanço no mesmo grupo dentro de 1000 ms; combustível/ERS não contam como confirmações separadas. Na confirmação, todos os grupos são limpos antes de aplicar a candidata com seus tempos originais. Proteção dos oito UIDs substituídos preservada.
- Expiração em **3000 ms**, relógio monotônico, publicação coalescida a até 10 Hz. Pneus ID 7, combustível e ERS vencem juntos; outros IDs não renovam esse grupo. `getSnapshot()` aplica expiração imediatamente; o timer publica a transição.
- Silêncio/idle não apaga identidade nem comprova pausa. Retomada exige avanço. Início, erro e parada do receptor limpam dados. A fonte cancela inscrições/timer idempotentemente.
- Contexto ausente/conflitante não bloqueia observação técnica. Estado geral da fonte continua descrevendo velocidade/marcha/volta; cada painel apresenta disponibilidade de seu pacote.

O arquivo de inicialização do Main, Preload, CSP e configuração de segurança ficaram inalterados; no Main, as mudanças se limitam ao parser e à fonte real descritos acima. Os painéis consomem a inscrição React existente, com cleanup; não têm timers nem assinaturas próprias. Não se criou decisão arquitetural permanente que exigisse alterar AGENTS.md.

## Verificações efetivamente executadas

Os resultados de testes, typecheck, build, smoke e inspeção das capturas abaixo pertencem à execução anterior à interrupção. Suas saídas de ferramentas, incluindo os códigos de saída, foram conferidas nesta conversa durante a retomada. Não representam novas execuções na retomada.

| Comando / verificação | Resultado nesta tarefa |
| --- | --- |
| Testes específicos de parser novo + parser/fonte de pneus | **113 aprovados**, 3 arquivos |
| Testes específicos de combustível/ERS (parser e fonte) | **82 aprovados**, 2 arquivos |
| `npm run typecheck` | Aprovado, código 0 |
| `npm run test` | **316 aprovados**, 11 arquivos, código 0 |
| `npm run build` | Aprovado, código 0; Main, Preload CommonJS e Renderer compilados |
| `node --check scripts/smoke.cjs` | Aprovado, código 0 |
| `npm run test:smoke`, modo `receive` | **SMOKE OK (receive)**, código 0 |
| Smoke modo `occupied` | **SMOKE OK (occupied)**, código 0 |
| Smoke modo `invalid` | **SMOKE OK (invalid)**, código 0 |
| Capturas de combustível/ERS em 980×660 e 640×500 | Quatro capturas inspecionadas; painéis legíveis após rolagem, sem cortes nos próprios painéis ou excesso horizontal |
| Revisão do diff, arquivos novos e whitespace | Concluída; `git diff --check` e checagem dos novos sem erros |
| Jogo F1 25 / addons / revisão independente | Não realizados pelo agente; relato manual posterior registrado abaixo, sem addons de bateria/clipping; revisão independente pendente |
| Smoke no servidor de desenvolvimento | Não executado; integração usa build de produção |

Os **82 casos novos** são 54 de parser/rótulos e 28 da fonte. Cobrem layouts completos, todos os truncamentos, excesso, seleção do último jogador, versão/formato/índices, zero/frações/float máximo finito, negativos MFD, NaN/infinito/negativos inválidos por campo, modos, MGU-H nos dois formatos, deslocamento da energia utilizada e limite de 2026. Incluem atualização atômica, snapshots imutáveis, duplicação/atraso/meia faixa/wraparound, flashback, reinício dos contadores, expiração/publicação conjunta, silêncio/retomada, identidade/UID/formato/jogador, confirmação sem contar domínios separados, erro/parada e cancelamentos. Os 234 testes anteriores continuam passando.

O smoke ampliado envia ID 7 completo por UDP local e verifica valores/unidades/rótulos no DOM em 2025/2026, ausentes/invalidade/zero/negativos, truncamento, duplicação, redução por flashback, expiração, retomada, mudança de identidade/formato, recarga e ausência dos painéis no simulador. Mantém as asserções anteriores de pneus, métricas, contexto, API restrita, sandbox, ausência de Node no Renderer e cancelamento de inscrição IPC. Capturas novas `fuel-initial.png`, `fuel-minimum.png`, `ers-initial.png` e `ers-minimum.png` ficam no diretório local ignorado `.smoke-profile/`.

Não houve falha de teste nem `UnknownVizError` nos três smokes desta execução. A intermitência gráfica histórica descrita na [V0.2C-B](validation-v0.2c-b.md#falhas-gráficas-e-limitações-da-evidência) permanece sem causa/resolução definitiva comprovada; as aprovações atuais não demonstram sua correção. As capturas mantêm diagnóstico, espera de frames e falha explícita, sem retry automático. O primeiro `git fetch` foi bloqueado por permissão de escrita em `.git/FETCH_HEAD`; após aprovação para execução fora do sandbox, o fetch foi concluído, sem alterar arquivos de produto.

### Conclusão na retomada — 15/11/2026

AGENTS.md foi relido. Confirmados a branch `feat/v0.3b-fuel-ers`, o HEAD `df10ec1`, os nove arquivos rastreados modificados, os sete novos e o staging vazio. As referências locais `main` e `origin/main` continuam no mesmo commit; não foi necessário outro fetch ou criar outra branch. Todos os arquivos modificados/novos foram revisados, incluindo fixtures e smoke, preservando integralmente as alterações anteriores.

A revisão não identificou falha funcional que exigisse modificar código ou testes. As quatro capturas e os artefatos de build da execução anterior permanecem disponíveis. Nesta retomada foram ajustados somente textos documentais para precisar o alcance das mudanças no Main, melhorar a terminologia e separar as evidências anteriores desta revisão. Typecheck, suíte, build e smokes não foram repetidos, pois não houve mudança funcional após suas aprovações. `git diff --check` e a verificação individual dos sete arquivos novos foram executados novamente: sem erros de whitespace. Na comparação `--no-index` contra `NUL`, o código 1 indica diferenças esperadas; os avisos de normalização LF → CRLF não são erros de whitespace.

A implementação ficou pronta para validação manual e revisão técnica independente. Esses dois passos estavam pendentes na conclusão da retomada; até aquele momento não houve commit, push, merge ou avanço de versão.

## Validação manual com F1 25 real — relato do usuário

Relato recebido em **15/11/2026**. O usuário informou aprovação dos sete cenários abaixo, sem anomalias relatadas. Os testes foram realizados com o **F1 25 sem addons que modifiquem o comportamento da bateria ou o clipping**. São observações manuais do usuário, separadas das fixtures e verificações automatizadas; o agente não executou o jogo nem efetuou medições específicas desses resultados.

| Cenário | Resultado relatado |
| --- | --- |
| Combustível | Aprovado |
| Energia armazenada | Aprovado |
| Modos ERS | Aprovado |
| Voltas e flashbacks | Aprovado |
| Pausa e interrupção UDP | Aprovado |
| Troca de protocolo e sessão | Aprovado |
| Interface e simulador | Aprovado |

A aprovação se limita aos cenários observados. Não demonstra precisão numérica, calibração das unidades, equivalência física, latência, ausência de perda de pacotes ou funcionamento universal. Não foram fornecidas medições específicas que convertam a convenção de kg ou a interpretação da escala das energias por volta em calibração comprovada. O relato também não valida addons energéticos nem comprova isoladamente todos os campos e valores-limite do roteiro.

Permanecem as diferenças documentadas entre UDP 2025/2026, a independência temporal entre IDs distintos, as restrições de identidade e UIDs retidos, a ausência de histórico persistente e a reconciliação incompleta de flashbacks. Pneus, combustível e ERS do mesmo ID 7 continuam compartilhando o mesmo instante. A intermitência histórica `UnknownVizError` permanece sem causa ou resolução definitiva comprovada. Nenhuma dessas limitações é encerrada pela ausência de anomalias neste relato.

## Revisão para commit e publicação da branch

Após a validação manual, o usuário autorizou o commit `feat: adiciona monitoramento real de combustível e ERS via UDP` e o push **exclusivamente de `feat/v0.3b-fuel-ers`**, sem merge na main ou exclusão de branches. A revisão técnica independente ocorrerá após essa publicação e antes de qualquer autorização de merge.

Nesta etapa, somente este documento e o README foram atualizados para registrar o relato e o estado da entrega. Código, contratos, parser, fixtures, testes e smoke permaneceram como na implementação verificada. Os resultados anteriores de **316 testes aprovados**, typecheck, build e três smokes aprovados mantêm sua origem na execução de implementação; não foram repetidos durante esta atualização documental.

A revisão abrangeu os 16 arquivos da entrega, incluindo os sete novos, e conferiu a consistência entre documentação, contratos, offsets, parser e testes. Não foi identificada falha relevante ou funcionalidade fora do escopo. A inspeção e a busca por padrões comuns de credenciais não identificaram segredos. Build, capturas, perfil gráfico e dependências permanecem ignorados e fora da seleção para commit. `git diff --check` e checagem individual dos arquivos novos não apontaram erros de whitespace. O receptor único, a segurança Electron e o escopo exclusivamente observacional foram preservados.

## Limitações e roteiro de validação manual no F1 25

Persistem as limitações de UIDs retidos, resets/saltos ambíguos de contador, contexto contraditório, diferenças temporais **entre IDs** e ausência de autenticação ou contador de erro de payload. Cabeçalho reconhecido não certifica conteúdo, ausência de perda ou origem. A validação sintética não comprova unidades/física de addons nem semântica do MFD em todos os modos. Capturas visuais da interface não são capturas de telemetria real.

1. Execute `npm run build` e `npm start`. Configure UDP local `127.0.0.1:20777`, broadcast desligado, inicialmente 20 Hz. Comece com UDP 2025 e repita em 2026. Sem transmissão, os painéis devem mostrar `—` e aguardar dados.
2. Na saída dos boxes, compare massa/capacidade recebidas com os valores do jogo disponíveis. Confirme a escala de kg e registre divergências, especialmente com addons. Compare **voltas restantes (jogo/MFD)** com a estimativa assinada exibida no MFD, incluindo zero e saldo negativo quando possível; não espere uma previsão própria do Pitwall.
3. Percorra voltas utilizando/recuperando ERS. Confira energia armazenada, recuperação MGU-K/MGU-H, utilização e limite 2026 quando recebido. Se o HUD mostrar somente porcentagem, ele não comprova joules sem capacidade conhecida: registre os valores brutos e a limitação, sem fabricar conversão. Não presuma que MGU-H será fisicamente ativo nem que o limite terá valor fixo.
4. Observe os modos disponíveis e seus códigos. Modo 3 deve aparecer como Overtake em 2025 e Boost em 2026. O rótulo não deve ser usado como evidência de acionamento manual ou de Overtake Mode/SLM.
5. Cruze a linha de chegada e faça flashbacks, inclusive atravessando voltas. Os contadores por volta podem reiniciar e a massa/energia pode subir ou descer. Confira também pneus, velocidade/marcha/volta e contexto. Registre divergências persistentes antes de reiniciar.
6. Pause/retome e use Alt+Tab. Desative explicitamente UDP por mais de três segundos: combustível, ERS e composto/idade devem vencer juntos. Reative e confira retomada. Pausa pode continuar transmitindo; não equivale necessariamente a silêncio ou avanço do contador.
7. Troque sessão/fim de semana, retome save e alterne 2025 → 2026 → 2025. Após confirmação, valores da identidade anterior não devem reaparecer combinados com a nova. Limite de recuperação deve desaparecer em 2025; demais campos permanecem conforme recebidos.
8. Alterne SIMULAÇÃO/UDP REAL, recarregue com `Ctrl+R`, teste rolagem em 980×660 e 640×500 e feche/reabra para conferir liberação da porta. Na simulação não há painéis de pneus, combustível ou ERS.
9. Registre data, build do jogo, addons, formato observado, taxa UDP, circuito/modo, índice do jogador, ações e resultado por campo. Separe observação visual, snapshot e hipótese. Este roteiro permanece para repetição e ampliação da evidência; a aprovação dos sete cenários não comprova a execução de todos os seus passos. Aguarde revisão independente antes de autorizar merge na main.

Inspeção opcional pela API existente, em desenvolvimento:

```javascript
const cancelar = window.pitwall.onRealTelemetry((estado) => {
  console.log(estado.identity, estado.tyreStatusFreshness,
    estado.tyreStatus, estado.fuel, estado.ers)
  cancelar()
})
```

O retorno IPC é assíncrono; a inscrição acima se cancela após a primeira resposta. Grupos vencidos são `null`; campos inválidos substituídos por `null` não permitem recuperar seu valor bruto original pelo snapshot.

## Arquivos da entrega

| Arquivo | Alteração |
| --- | --- |
| `src/shared/fuel.ts` (novo) | Contrato de combustível |
| `src/shared/ers.ts` (novo) | Contrato energético e modos por protocolo |
| `src/shared/realTelemetry.ts` | Campos `fuel`/`ers`, timing/frescor compartilhados |
| `src/main/udp/decodeTyres.ts` | Extensão da leitura única ID 7 e validação por campo |
| `src/main/telemetry/RealTelemetrySource.ts` | Armazenamento/aplicação atômica do ID 7 |
| `src/renderer/src/FuelErsPanels.tsx` (novo) | Painéis, unidades e disponibilidade |
| `src/renderer/src/App.tsx` | Integração em UDP REAL e identificação V0.3B |
| `src/renderer/src/styles.css` | Estilos restritos aos novos painéis |
| `tests/fixtures/f1-car-status.ts` (novo) | Fixtures completas independentes dos parsers |
| `tests/fuel-ers-parser.test.ts` (novo) | Layouts, valores, modos e rejeições |
| `tests/fuel-ers-source.test.ts` (novo) | Integridade temporal, identidades e recursos |
| `tests/tyre-parser.test.ts` | Expectativa completa do ID 7 ampliada, preservando asserções anteriores |
| `scripts/smoke.cjs` | Integração e capturas dos dois painéis |
| `README.md` | Escopo, arquitetura, limites e roteiro |
| `docs/udp-protocol.md` | Fontes, offsets, unidades e políticas |
| `docs/validation-v0.3b.md` (novo) | Este registro |

Na revisão anterior à seleção para commit: nove arquivos rastreados modificados e sete novos. AGENTS.md, Main de inicialização, Preload, simulador, TyrePanel e dependências permaneceram inalterados. Build, capturas e perfil gráfico estão ignorados pelo Git. Mensagem de commit autorizada: `feat: adiciona monitoramento real de combustível e ERS via UDP`.
