# Validação V0.2C-B — ciclo de vida e contexto das sessões

Implementação iniciada em **14/11/2026** e retomada em **15/11/2026**. Branch: `feat/v0.2c-session-lifecycle`. Validação manual com F1 25 real relatada pelo usuário nos seis cenários abaixo. Commit e push exclusivamente desta branch autorizados; revisão técnica independente **pendente antes do merge**. Merge na main não autorizado.

## Preparação e retomada

- A V0.2C-A está integrada à `main` no commit `4fb96f8` (`feat: aprimora integridade temporal UDP e sessões`). Na preparação inicial, `git fetch origin` concluiu e `git rev-list --left-right --count main...origin/main` retornou `0 0`. A árvore estava limpa e a branch solicitada foi criada dessa base, sem merge.
- O fetch inicial precisou de permissão para gravar `.git/FETCH_HEAD`; fetch e criação da branch concluíram após a permissão. Isso não é falha de produto.
- A retomada confirmou a mesma branch e HEAD, cinco arquivos rastreados modificados e quatro novos. Todas as alterações foram preservadas. Não houve recriação da branch nem nova sincronização sobre a árvore modificada.
- AGENTS.md, README, protocolo, validação anterior, decoders, fonte real, receptor, Main, Preload, contratos, Renderer, fixtures e testes foram inspecionados. AGENTS.md permaneceu inalterado: a arquitetura e suas regras permanentes continuam aplicáveis.

## Escopo e modelo de contexto

O parser mínimo `decodeSession` interpreta apenas identificação de sessão/circuito e os três vínculos do ID 1, além dos metadados necessários de cabeçalho. Usa o único socket existente, no Main. O contexto viaja no snapshot de telemetria real pelo IPC restrito existente; não há nova API de rede, canal genérico ou acesso ao Node no Renderer. Main de integração, Preload, CSP, configuração de segurança, simulador e dependências não foram alterados.

| Conceito | Contrato e comportamento |
| --- | --- |
| Identidade técnica | `identity`: `sessionId` (sessionUID uint64 como string decimal), `packetFormat`, `playerCarIndex` |
| Contexto lógico observado | `context`: `sessionType`, `trackId`, `seasonLinkIdentifier`, `weekendLinkIdentifier`, `sessionLinkIdentifier` e timing do ID 1 |
| Desconhecidos | Tipo/circuito não documentados e vínculos zero viram `null`; não recebem valores simulados ou anteriores |
| Estado | `unidentified`, `identified` ou `unavailable`; identificação pode ser parcial |
| Transição confirmada | Mudança de `identity` e incremento de `identityRevision`; não significa novo fim de semana |
| Interface | Uma linha discreta de tipo/circuito abaixo dos indicadores existentes, somente em UDP REAL |

`identityRevision` começa em zero e reinicia junto com a fonte/receptor. Serve para distinguir transições confirmadas sem eventos passageiros nem histórico. Não avança com o relógio. `contextStatus` não altera o estado geral de velocidade/marcha/volta. Contexto ausente ou vencido não impede métricas frescas, e contexto sozinho não fabrica métricas.

## Fundamentação EA, campos e offsets

Foram consultados os dois TXT oficiais e os PDFs oficiais na execução inicial. Fontes e derivação completa: [Session Data no protocolo](udp-protocol.md#session-data-mínimo--v02c-b). Os PDFs informam **packetVersion 1**, frequência nominal **2 Hz**, tamanho **753 bytes em 2025** e **926 bytes em 2026**, na página 4 de cada documento. A versão documental 1.1 de 2026 não é a versão do pacote.

| Campo | Tipo | Offset 2025 | Offset 2026 |
| --- | --- | --- | --- |
| packetFormat | uint16 LE | 0 | 0 |
| sessionUID | uint64 LE | 7 | 7 |
| sessionType | uint8 | 35 | 35 |
| trackId | int8 | 36 | 36 |
| seasonLinkIdentifier | uint32 LE | 670 | 670 |
| weekendLinkIdentifier | uint32 LE | 674 | 674 |
| sessionLinkIdentifier | uint32 LE | 678 | 678 |

Os layouts foram conferidos separadamente, sem presumir equivalência por ano visual. Os offsets usados coincidem; 2026 acrescenta 173 bytes após a estrutura comum de 753 bytes. Cabeçalho de 29 bytes, arrays packed e trailer fundamentam os comprimentos. O parser exige tamanho exato, versão conhecida, ID correto, tempo finito e jogador válido antes de ler o payload. Não interpreta clima, estratégia, Safety Car ou campos extras de 2026.

Os apêndices documentam tipos 1–18. Circuito 0 é válido (Melbourne); -1 e códigos ausentes da tabela viram `null`. Madrid (42) é reconhecido somente em 2026. Os vínculos não zero são valores opacos: a persistência entre saves não comprova autenticidade, cronologia ou unicidade global. Zero como vínculo indisponível é uma política local conservadora, não uma alegação de sentinela especificada pela EA. UID técnico zero mantém o comportamento anterior, sem ser promovido a referência lógica confiável.

## Transições, contradições e retomadas

1. O primeiro pacote válido estabelece a identidade técnica. Outra identidade exige duas amostras com avanço no mesmo grupo dentro da janela existente de 1000 ms. Agora ID 1 também pode confirmar; IDs 2/6 continuam suficientes sem contexto.
2. A confirmação limpa os três grupos antes de aplicar os dados candidatos. Preserva instantes originais de recepção e não compara contadores entre IDs ou identidades.
3. Cada grupo usa a comparação modular de `overallFrameIdentifier` da V0.2C-A. Duplicatas, atrasos e meia faixa ambígua não renovam frescor. Tempo/frame/volta menores continuam permitidos com avanço do contador geral.
4. Contexto vence em 3000 ms, independentemente das métricas. Silêncio, Alt+Tab e expiração não apagam identidade, ordem ou proteção de UIDs; não declaram pausa nem término.
5. Referências conhecidas dos cinco campos são conservadas internamente apenas para detectar contradições na identidade atual. `null` não apaga essa referência, mas continua `null` no snapshot. As referências conhecidas da candidata também sobrevivem à confirmação, inclusive quando o último pacote tem campos desconhecidos.
6. Contradição em contexto ativo mais novo oculta o contexto até troca técnica confirmada ou reinício. As métricas seguem suas próprias regras técnicas, sem associação lógica. Contradição entre contextos candidatos descarta a candidatura; tráfego posterior pode iniciar outra.
7. A fila dos oito UIDs substituídos permanece intacta e abrange os três IDs. Um UID bloqueado não é reativado por igualdade/diferença de vínculos, zero, silêncio ou contadores crescentes.

Retomar com UID novo e vínculos iguais funciona como nova transmissão confirmada, sem transportar medições do save anterior. Duas sessões podem informar o mesmo fim de semana; outro fim de semana pode informar vínculos diferentes. A entrega expõe essas referências, sem agrupamento automático ou persistência.

Alternativas rejeitadas: desbloquear UID por timeout, aceitar reset pelo relógio ou reconhecer retomada só pela igualdade dos vínculos. Pacotes antigos podem satisfazer todos esses critérios. Também não se cria sessão nova a partir de mudança de tipo/circuito/vínculo sob o mesmo UID: faltam evidências para associar métricas a essa mudança. A decisão prioriza contexto indisponível em situações ambíguas.

A memória continua limitada: três grupos ativos, até três pacotes decodificados candidatos, cinco referências de contexto por identidade ativa/candidata e oito strings de UID. Buffers não são retidos. Não há histórico de fim de semana, persistência, estratégias, rádio, overlay ou novas métricas de corrida.

## Verificações executadas

Resultados da implementação retomada em 15/11/2026, anteriores ao relato manual, salvo indicação explícita. Não são novas execuções durante a revisão documental para publicação. Todos os pacotes usados nos testes automatizados são **fixtures sintéticas**, mesmo nos testes com sockets locais e Electron real.

| Verificação | Resultado efetivamente observado |
| --- | --- |
| Testes específicos na execução inicial, antes da interrupção | 76 aprovados em 2 arquivos; registro histórico desta tarefa |
| Testes específicos no início da retomada | 76 aprovados em 2 arquivos, código 0 |
| Parser, fonte e receptor após complemento | 87 aprovados em 3 arquivos, código 0 |
| `npm run typecheck` | Aprovado, código 0 |
| `npm run test` | **173 testes aprovados em 7 arquivos**, código 0; inclui cobertura anterior e simulador |
| `npm run build` | Aprovado, código 0; Main, Preload CommonJS único e Renderer compilados |
| `node --check scripts/smoke.cjs` | Aprovado, inclusive no script final, código 0 |
| Smoke `receive` | Aprovado inicialmente e com o script gráfico final: `SMOKE OK (receive)` |
| Smoke `occupied` | Duas falhas `UnknownVizError` e um timeout durante investigação; **execução final aprovada, código 0** |
| Smoke `invalid` | Aprovado com espera de renderização e novamente com o script final: `SMOKE OK (invalid)` |
| Sequência final `receive` + `invalid` | Ambos aprovados, comando conjunto com código 0; `occupied` final executado isoladamente |
| Diff e whitespace | Diff revisado, `git diff --check` sem erros; cinco arquivos novos inspecionados e verificados separadamente |
| F1 25 real | Não executado pelo agente; pendente na conclusão inicial. Relato manual posterior do usuário registrado separadamente abaixo |
| Smoke no servidor de desenvolvimento | Não executado; integração usou o build de produção |

Os testes de contexto cobrem decodificação nos dois formatos, limites de leitura, UID uint64 máximo, vínculos/zeros/desconhecidos, TLs/classificações/corrida, mesmo e outro fim de semana, retomada com UID novo, UID bloqueado, contexto antigo após transição, flashback, wraparound, resets/ambiguidade, frescor independente, contexto ausente, conflitos, alternância de formato, cancelamentos e limpeza. O teste de socket comprova que contexto e métricas usam o receptor existente. A ponte continua coberta pelos testes anteriores e pelo smoke.

O smoke de recepção exercita contexto 2025/2026 com rótulos, duplicatas/atrasos, limpeza após troca confirmada por métricas, mesmo fim de semana, outro fim de semana, retomada de vínculos com UID novo, bloqueio de UID anterior, conflito, campos desconhecidos, expiração/retomada e persistência do snapshot após recarga. Mantém R/N, flashback, simulador, API restrita, cancelamento IPC e testes de segurança. Capturas de recepção foram inspecionadas nos tamanhos inicial e mínimo: sem excesso horizontal, com rolagem vertical esperada; o rótulo longo de classificação sprint permanece legível.

### Falhas gráficas e limitações da evidência

`UnknownVizError` reapareceu no modo `occupied`, como no histórico da [V0.2A](validation-v0.2a.md). A primeira tentativa falhou sem identificação da etapa; a segunda, após instrumentar o script sem retry, identificou `webContents.capturePage()` no tamanho inicial. Antes dela, as asserções de diagnóstico EADDRINUSE, simulador e recarga haviam passado. O cenário `invalid` não foi executado nessas duas sequências porque elas interrompiam no primeiro erro.

Foi ampliada a espera de dois frames, antes usada somente após redimensionamento, para ambas as capturas. A execução `occupied` então atingiu o limite de 40 segundos dentro da preparação/captura; o encerramento invalidou o frame e a tentativa de ler a janela destruída gerou um erro secundário. A causa do bloqueio não ficou comprovada. O modo `invalid`, executado em seguida sem interromper a sequência, passou.

O script foi ajustado para garantir janela exibida antes da espera gráfica, registrar visibilidade/minimização e proteger a leitura diagnóstica após destruição. Esses ajustes são exclusivos do smoke; não alteram a configuração do produto. O modo `occupied` passou isoladamente com código 0. Em seguida, `receive` e `invalid` passaram em sequência com código 0. Os registros finais indicaram janela visível e não minimizada antes das duas capturas, em todos os modos. Isso não identifica a causa das ocorrências anteriores nem comprova sua resolução definitiva; o erro permanece para acompanhamento.

A revisão final confirmou **nove arquivos rastreados modificados e cinco novos**, todos listados abaixo, sem alterações no staging. `git diff --check` passou. Os arquivos novos também foram inspecionados e conferidos com `git diff --no-index --check`; diferenças contra o arquivo vazio são esperadas. O Git informou normalização futura LF → CRLF nos arquivos novos, sem erro de whitespace. Não se repetiu a suíte completa ou o build após mudanças restritas ao smoke e documentação: o código de produto permaneceu igual ao build testado.

Não há retry automático que esconda falhas. Aprovação de uma repetição não comprova resolução definitiva da intermitência, e a validação gráfica não substitui o jogo real.

## Validação manual com o F1 25 real — relato do usuário

Relato recebido em **15/11/2026**. O usuário informou aprovação dos seis cenários abaixo, sem comportamento anormal, travamento ou congelamento observado. São observações relatadas pelo usuário, separadas dos testes sintéticos e automatizados; o agente não executou o jogo nem realizou medições desses cenários.

| Cenário | Resultado relatado |
| --- | --- |
| TL1, TL2 e TL3 | Reconhecimento e transições funcionando corretamente |
| Q1, Q2 e Q3 | Identificação das etapas da classificação funcionando |
| Corrida | Contexto e telemetria funcionando corretamente |
| Flashbacks e pausas | Retrocessos, interrupções e retomadas funcionando |
| Retomada de save | Funcionamento normal, sem bloqueios observados |
| Outro GP e formatos UDP | Troca de circuito e utilização dos formatos 2025 e 2026 funcionando corretamente |

O relato valida os cenários observados, sem comprovar funcionamento universal, ausência de perda de pacotes, latência ou sincronização perfeita. Não foram fornecidos UIDs, vínculos, sequências de contadores ou capturas binárias para determinar se houve reutilização de UID bloqueado, reset de contador ou contradição de contexto. A retomada de save sem bloqueio observado não elimina essas possibilidades nem altera a política defensiva. A reconciliação de flashbacks continua incompleta, e o histórico de `UnknownVizError` permanece válido e sem resolução definitiva comprovada.

O roteiro manual adiante permanece disponível para repetição e ampliação das evidências; o relato não afirma execução de todos os seus passos técnicos.

## Revisão para commit e publicação da branch

Após o relato manual, o usuário autorizou o commit `feat: adiciona contexto e ciclo de vida das sessões UDP` e o push exclusivamente de `feat/v0.2c-session-lifecycle`. A revisão técnica independente será realizada após a publicação, antes de qualquer autorização de merge.

Nesta etapa, somente este documento e o README foram atualizados para registrar o relato e corrigir o estado da validação. Código, fixtures, testes e smoke permaneceram como na implementação anteriormente verificada. A suíte completa, o build e os smokes não foram repetidos: seus resultados acima são registros das execuções anteriores.

Foram revisados os nove arquivos rastreados modificados e os cinco novos, mantendo o escopo da V0.2C-B. A inspeção e a busca por padrões comuns de credenciais não identificaram segredos no conteúdo selecionado. Build, dependências e perfil/capturas do smoke permanecem ignorados pelo Git e fora da seleção para commit. A conferência de whitespace abrange o diff e os arquivos novos. Nenhuma funcionalidade adicional foi implementada.

## Limitações conhecidas e pendências

- Retomada que reutilize UID ainda bloqueado continua bloqueada. Reinício explícito limpa referências e proteção; não é prova de nova transmissão nem reconciliação do save.
- Resets de contador sob a mesma identidade seguem a comparação modular e podem ser rejeitados ou indistinguíveis de avanço/wraparound. Saltos de meia faixa ou mais não são resolvidos por heurística.
- Mudança legítima de tipo/circuito/vínculo sob identidade técnica invariável torna o contexto indisponível. É necessário validar se esses cenários ocorrem no jogo; a política atual não os interpreta automaticamente.
- Primeira identidade/contexto pode vir de pacote atrasado. A fila é limitada; UID que saiu dela, formato/carro anterior sob o mesmo UID e rajadas coerentes desconhecidas podem assumir mediante confirmação.
- Frequência esparsa, pausas com contador repetido e perda de ID 1 podem atrasar confirmação ou vencer contexto. A publicação de contexto não exige frames comuns aos indicadores.
- A reconciliação de flashbacks permanece incompleta: os grupos podem representar momentos diferentes até suas próximas amostras aceitas. O relato de funcionamento normal não comprova sincronização entre eles.
- Não há autenticação do remetente, correlação histórica completa, captura binária real, medição de perda/latência ou prova de comportamento em todos os modos.
- Pendências: revisão técnica independente antes do merge e acompanhamento das limitações e da falha gráfica registrada. A validação manual dos seis cenários foi relatada; os casos ambíguos acima continuam sem comprovação de resolução.

## Roteiro manual com F1 25

1. Execute `npm run build` e `npm start`, use UDP local conforme o README e selecione UDP REAL. Comece em 2025; repita o roteiro em 2026. Sem jogo, métricas ficam em **—** e o contexto aguarda dados.
2. Na pista, confira tipo/circuito com o jogo e velocidade, marcha e volta com o HUD. Percorra TL1, TL2, TL3, classificações e corrida. Contexto ausente não deve impedir métricas. Observe se há rótulo desconhecido/indisponível e registre a sequência.
3. Passe a outro fim de semana/circuito, saia e entre em outra sessão. Não devem reaparecer métricas antigas após confirmação da nova identidade. Rótulos não devem ser deduzidos pelo carro/pintura.
4. Salve/saia/retome, inclusive voltando a um save anterior sem reiniciar o Pitwall. Registre funcionamento ou bloqueio antes de reiniciar; não assuma que UID mudou ou foi reutilizado apenas pelo resultado visual.
5. Faça flashbacks repetidos, inclusive à volta anterior. Pause/retome e use Alt+Tab. Desative explicitamente UDP por mais de três segundos: métricas e contexto devem vencer conforme seus próprios pacotes. Ao reativar, amostras novas devem recuperar os grupos; silêncio não deve ser mostrado como pausa/fim.
6. Alterne 2025 → 2026 → 2025. Recarregue (`Ctrl+R`) durante fluxo e silêncio: a recarga preserva socket e estado Main. Alterne SIMULAÇÃO/UDP REAL: contexto real não aparece como contexto simulado.
7. Verifique tamanhos inicial/mínimo e rolagem; feche e reabra para conferir liberação da porta. Se houver indisponibilidade persistente, registre-a antes do reinício e compare depois.
8. Registre data, build do jogo, formato observado, modo de jogo, taxa UDP, circuito, sequência/duração das ações e resultado por formato. Separe observação visual, dados do snapshot e hipótese. O HUD não prova duplicações, atrasos nem reutilização de UID.

Para inspeção técnica opcional, em uma execução de desenvolvimento com DevTools aberto, o contrato já existente permite obter um snapshot sem acrescentar API ao produto:

```javascript
const cancelar = window.pitwall.onRealTelemetry((estado) => {
  console.log(estado.identity, estado.identityRevision, estado.contextStatus, estado.context)
  cancelar()
})
```

O snapshot solicitado chega por IPC assíncrono; a inscrição é cancelada após a primeira resposta. Compare UID e vínculos antes/depois das transições. Contexto vencido/conflitante é `null`: registre o snapshot durante recepção. Não afirme conhecer os vínculos brutos conflitantes a partir de um snapshot indisponível; isso exigiria captura adicional, fora desta entrega.

## Arquivos criados e modificados

| Arquivo | Alteração |
| --- | --- |
| `src/main/udp/decodeSession.ts` (novo) | Parser mínimo defensivo 2025/2026 |
| `src/shared/sessionContext.ts` (novo) | Contratos, IDs reconhecidos e rótulos |
| `src/shared/realTelemetry.ts` | Contexto, estado e revisão de identidade no snapshot |
| `src/main/telemetry/RealTelemetrySource.ts` | Terceiro grupo, frescor, candidatura e contradições |
| `src/renderer/src/App.tsx` | Indicação discreta de contexto e identificação V0.2C-B |
| `src/renderer/src/styles.css` | Estilo da indicação de contexto |
| `tests/fixtures/f1-session.ts` (novo) | Fixtures sintéticas independentes do decoder |
| `tests/session-parser.test.ts` (novo) | Decodificação, layouts e rejeições |
| `tests/real-telemetry-source.test.ts` | Transições, retomadas, conflitos, ordem e ciclo de vida |
| `tests/udp-receiver.test.ts` | Contexto no socket existente e cancelamentos |
| `scripts/smoke.cjs` | Integração de contexto e diagnóstico de capturas gráficas |
| `README.md` | Escopo, arquitetura, limites e roteiro |
| `docs/udp-protocol.md` | Layouts, fundamentação e políticas |
| `docs/validation-v0.2c-b.md` (novo) | Este registro de evidências e pendências |

Mensagem de commit autorizada: `feat: adiciona contexto e ciclo de vida das sessões UDP`.
