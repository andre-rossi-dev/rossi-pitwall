# Validação V0.2B — decodificação de telemetria real

Data das execuções automatizadas e do recebimento do relato manual: **14/11/2026**. Branch: `feat/v0.2b-real-telemetry`. Primeira comparação visual com o HUD relatada pelo usuário nos formatos 2025 e 2026; entrega local aguardando revisão de código, **sem commit, push, merge ou publicação**.

## Preparação e escopo

- Árvore inicialmente limpa. Após `git fetch origin`, `main` e `origin/main` apontavam para `18427324311be0c2a051fef24e54717c5c9925d4`.
- AGENTS.md, código, testes e documentação anteriores foram inspecionados. Baseline executada: **49 testes aprovados**, 4 arquivos.
- Anexos TXT oficiais EA 2025/2026 conferidos; PDFs oficiais confirmaram versão 1 para IDs 2 e 6. Fontes, cálculos e offsets em [Protocolo UDP](udp-protocol.md).
- Metadados atualizados para `0.2.0-alpha.2`; nenhuma dependência adicionada ou atualizada.

## Implementação e decisões

O receptor existente distribui datagramas internamente no Main, preservando socket único e diagnóstico. Um parser puro valida formato/ID/versão/tamanho/índice e decodifica exclusivamente velocidade, marcha e volta. A camada `RealTelemetrySource` trata identidade (sessão decimal sem perda de uint64, formato e carro), dados parciais, frescor por grupo e publicação a 10 Hz. Trocar identidade limpa ambos os grupos. Não há exigência de frames iguais nem filtro de retrocessos.

O contrato real é separado da amostra completa do simulador para representar ausência e expiração com null. O Preload instala listeners canceláveis antes de solicitar estado inicial; Main valida janela e frame. A interface começa em UDP REAL e permite SIMULAÇÃO, com selo permanente, R/N, traços para ausência/expiração e estados de recepção parcial, espera e desatualização. Recarregar mantém o estado Main e retorna a seleção visual para UDP REAL.

O simulador, sua implementação e seus testes foram preservados. AGENTS.md não foi alterado: a implementação segue as decisões arquiteturais existentes; detalhes operacionais ficam na documentação técnica.

## Verificações automatizadas da implementação inicial

Registro histórico das execuções anteriores ao relato manual. As verificações repetidas durante a revisão posterior estão registradas separadamente abaixo.

| Verificação | Resultado |
| --- | --- |
| Baseline Vitest | 49 testes aprovados em 4 arquivos |
| Testes específicos após a correção descrita abaixo | 72 testes aprovados em 4 arquivos |
| `npm run typecheck` final | Aprovado, código 0 |
| `npm run test` final | **107 testes aprovados em 6 arquivos**, código 0; duração reportada 1,21 s |
| `npm run build` final | Aprovado, código 0; Main, Preload CommonJS e Renderer compilados |
| `node --check scripts/smoke.cjs` | Aprovado, sintaxe do script |
| Electron smoke `receive` | Aprovado, `SMOKE OK (receive)` |
| Electron smoke `occupied` | Aprovado, `SMOKE OK (occupied)` |
| Electron smoke `invalid` | Aprovado, `SMOKE OK (invalid)` |
| Sequência gráfica final após reforço da captura | Três cenários aprovados; comando terminou com código 0 |
| `git diff --check` | Aprovado; arquivos novos também revisados |
| F1 25 real e comparação com HUD | Não executados pelo agente; naquele momento aguardavam o usuário. Relato posterior registrado na seção de validação manual abaixo |
| Smoke no servidor de desenvolvimento | Não executado nesta entrega; integração gráfica usou build de produção |

Os testes cobrem dois formatos, seleção de carro zero/não zero/último índice, todas as marchas, tamanhos completos, todos os truncamentos, bytes extras, versão incompatível, campos inválidos, ordens ID 2/6, precisão da sessão, troca de identidade, expiração exata e independente, pacotes rejeitados, retrocessos, rajadas, cancelamentos, reinício, imutabilidade e preservação do socket/diagnóstico/simulador. O relógio dos testes de estado é controlado; os testes de transporte usam sockets locais reais.

O smoke transmite **conteúdo sintético** para o Electron de produção: os dois formatos usam o último carro, com outros carros contendo valores distintos. Confere valores no DOM, ré/neutro, dados parciais, mudança de sessão/formato, pacote truncado, cancelamento IPC, snapshot após recarga, expiração sem tráfego, retomada e simulação contínua. Verifica isolamento, sandbox, ausência de acesso Node e de erros de console/preload. Porta ocupada e configuração inválida continuam visíveis no diagnóstico e não interrompem a simulação.

As capturas locais `.smoke-profile/udp-{receive,occupied,invalid}.png` e `-minimum.png` ficam ignoradas pelo Git. Há verificação de ausência de overflow horizontal e de correspondência entre captura e viewport mínimo. Rolagem vertical permite acessar o diagnóstico na janela menor.

## Primeira validação manual com o F1 25 real

**Relato do usuário recebido em 14/11/2026**, após executar o F1 25 em uma janela de **1280×720**, ao lado do ROSSI Pitwall. Os resultados abaixo são observações visuais com o jogo real, não resultados das fixtures sintéticas nem de uma execução do jogo pelo agente. O usuário informou funcionamento nos formatos UDP **2025 e 2026**.

| Cenário observado | Resultado relatado pelo usuário |
| --- | --- |
| Velocidade | Acompanhou visualmente o HUD do jogo |
| Marchas | R, N e 1–8 identificadas corretamente |
| Número da volta | Correspondeu ao jogo |
| Carro parado antes da linha de chegada | A volta não avançou enquanto permaneceu parado; avançou somente após cruzar a linha |
| Pausa com interrupção da transmissão | O Pitwall indicou dados desatualizados após aproximadamente 3 segundos |
| Retomada da sessão | Os indicadores voltaram a acompanhar os dados recebidos |
| Flashbacks repetidos, inclusive para uma volta anterior | Número da volta e marchas acompanharam os retrocessos observados |
| Formatos UDP | 2025 e 2026 funcionaram durante os testes manuais |

O relato fornece evidência de funcionamento dos três indicadores e aceitação dos retrocessos nos cenários observados. **Não comprova reconciliação completa de flashbacks, ausência de perda de pacotes, latência medida ou sincronização temporal perfeita com o HUD.** O prazo de aproximadamente 3 segundos é uma estimativa visual, não uma medição automatizada. Como houve interrupção da transmissão junto à pausa, essa observação não permite concluir que o silêncio UDP identifica automaticamente uma pausa do jogo.

Não foram informados build/versão exata do jogo, duração de cada teste, taxa de envio UDP ou índice do jogador. O relato não separa cada cenário por formato nem informa uma contagem de repetições dos flashbacks. Não foi fornecida captura binária real; as fixtures do repositório continuam sintéticas. Os limites de ordenação, frescor e sessão descritos em [Protocolo UDP](udp-protocol.md) permanecem válidos.

## Revisão após o relato manual — 14/11/2026

Nesta etapa foram alterados somente este registro e o README, para incorporar o relato e atualizar o estado da entrega. Nenhum código, teste, dependência ou funcionalidade foi acrescentado ou modificado. As alterações locais da implementação foram preservadas.

A revisão do código e do diff confirmou o escopo limitado aos três indicadores em IDs 2/6, seleção do jogador primário, estado de sessão/frescor e alternância real/simulado. Permanecem o socket único no Main, a API restrita com validação de remetente/frame, subscriptions canceláveis e os bloqueios de segurança. A implementação do simulador, seu contrato e seus testes, o inspetor de cabeçalho, a configuração UDP, a configuração de build e a CSP não apresentam diff em relação ao HEAD. Os metadados de versão mudaram na V0.2B, sem alterações nas dependências. Não foram incluídos voz, overlay, estratégia, histórico, serviços externos ou parser de outros payloads. A documentação técnica de protocolo foi revisada e não precisou de alteração nesta etapa.

| Verificação repetida nesta revisão | Resultado efetivamente obtido |
| --- | --- |
| `npm run typecheck` | Aprovado, código 0 |
| `npm run test` | **107 testes aprovados em 6 arquivos**, código 0; duração reportada 1,46 s |
| `npm run build` | Aprovado, código 0, incluindo checagem de tipos |
| `node --check scripts/smoke.cjs` | Aprovado, código 0 |
| Smoke Electron `receive` | `SMOKE OK (receive)` |
| Smoke Electron `occupied` | `SMOKE OK (occupied)` |
| Smoke Electron `invalid` | `SMOKE OK (invalid)` |
| Sequência dos três smokes | Concluída com código 0, sem mudanças no script |
| Revisão do diff e `git diff --check` | Sem problemas de whitespace; arquivos novos também verificados |

**Nenhuma regressão foi identificada na revisão e nos cenários automatizados executados.** Isso não constitui garantia de ausência de defeitos fora da cobertura. O `UnknownVizError` histórico não reapareceu nesta sequência, mas permanece registrado, sem causa determinada nem alegação de resolução definitiva. O agente não executou o F1 25; a evidência real continua sendo o relato do usuário. Não foi repetido o smoke no servidor de desenvolvimento.

Estado do Git nesta revisão: branch `feat/v0.2b-real-telemetry`, HEAD `1842732`, sem commits adicionais em relação à `main` local e sem upstream configurado para a branch. Há **15 arquivos rastreados modificados e 7 novos não rastreados**, sem alterações no staging. Esse inventário inclui toda a implementação já existente; as edições desta etapa se limitam aos dois documentos. Não foram feitos commit, push ou merge.

### Conferência da retomada — 14/11/2026

Na retomada, foi conferida a saída efetiva da execução anterior: os cenários `receive`, `occupied` e `invalid` já haviam emitido `SMOKE OK`, e a sequência havia terminado com código 0. Portanto, não restavam cenários de smoke pendentes. Esses resultados, assim como os 107 testes, typecheck e build acima, são das execuções anteriores desta conversa, não de novas execuções na retomada.

Foram reconferidos branch, estado do Git, diff, arquivos novos, escopo e documentação do relato manual. A única edição desta retomada foi esta nota; não houve mudança de código, testes, planejamento ou funcionalidades. `git diff --check` e a verificação dos arquivos novos foram executados novamente, sem problemas de whitespace. Sem mudanças de implementação ou novos indícios de falha, não foi necessário repetir as suítes já aprovadas. Nenhuma nova regressão foi identificada na revisão, mantendo os limites de cobertura e o registro de intermitência acima. A V0.2B está pronta para revisão técnica independente; publicação e operações de commit/push/merge continuam pendentes de autorização.

## Problemas encontrados e tratamento

1. A primeira execução específica passou 56 testes, mas falhou ao coletar o arquivo de estado: `%j` no título parametrizado tentou serializar BigInt. O título foi alterado para `%o`; a repetição passou os 72 testes específicos. O erro estava no teste, não no transporte de sessão.
2. Na revisão dos construtores sintéticos, foram corrigidos os offsets dos campos auxiliares gridPosition/driverStatus/resultStatus para 43/44/45 antes da execução específica aprovada. A volta continua no offset 33; esses campos auxiliares não são decodificados pelo produto.
3. Os três cenários gráficos iniciais passaram, mas a captura mínima de `receive` ainda tinha as dimensões anteriores: esperar 100 ms após `setSize` não garantia redimensionamento concluído. O script passou a esperar o novo viewport e dois frames de renderização, além de comparar dimensões da imagem. A sequência final dos três cenários passou com essa asserção. Isso verifica essas execuções, sem garantir ausência de intermitências gráficas futuras.
4. O `UnknownVizError` histórico da V0.2A não apareceu nas execuções desta tarefa. Nenhuma correção específica foi feita para ele; o registro histórico e sua causa não determinada permanecem em [Validação V0.2A](validation-v0.2a.md).

## Inventário de arquivos

| Criados | Responsabilidade |
| --- | --- |
| `src/main/udp/decodeTelemetry.ts` | Parser defensivo dos dois layouts |
| `src/main/telemetry/RealTelemetrySource.ts` | Sessão, grupos e frescor |
| `src/shared/realTelemetry.ts` | Contratos independentes de Electron/React |
| `tests/fixtures/f1-telemetry.ts` | Pacotes completos sintéticos |
| `tests/real-telemetry-parser.test.ts` | Decodificação e rejeições |
| `tests/real-telemetry-source.test.ts` | Estado, tempo e ciclo de vida |
| `docs/validation-v0.2b.md` | Este registro |

| Modificados | Responsabilidade |
| --- | --- |
| `src/main/udp/UdpReceiver.ts` | Inscrição interna nos datagramas do socket existente |
| `src/main/index.ts` | Integração, request validado e cleanup |
| `src/shared/ipc.ts`, `src/preload/index.ts` | Canal restrito e snapshot inicial real |
| `src/shared/udp.ts` | Comentário alinhado à separação das camadas |
| `src/renderer/src/App.tsx`, `styles.css`, `UdpDiagnostics.tsx` | Seletor, indicadores e textos |
| `tests/preload.test.ts`, `tests/udp-receiver.test.ts` | Integração e cancelamentos |
| `scripts/smoke.cjs` | Fluxo gráfico com payloads completos e validação da captura |
| `package.json`, `package-lock.json` | Metadados V0.2B |
| `README.md`, `docs/udp-protocol.md` | Uso, offsets, arquitetura, limites e roteiro manual |

## Limitações e revisão antes da publicação

Não há captura binária do jogo, validação de todas as estruturas, autenticação UDP ou medição de perda de pacotes. Somente IDs 2/6 versão 1, jogador primário. Mudanças de identidade são reconhecidas em pacotes aceitos pelo parser. O último pacote válido recebido prevalece, mesmo atrasado; não há reconciliação de flashbacks. Silêncio não prova pausa e pacotes repetidos mantêm frescor de recepção. Outros payloads permanecem desconhecidos e os contadores existentes descrevem somente inspeção de cabeçalho.

A primeira validação manual foi relatada acima. Para repetir ou ampliar a evidência no Windows, execute `npm run build` e `npm start`; configure UDP para `127.0.0.1:20777` no jogo, selecione UDP REAL e siga [Validação V0.2B com o jogo](../README.md#validação-v02b-com-o-jogo). O roteiro inclui verificações adicionais que não foram explicitamente relatadas, como troca de identidade, alternância dos modos, recarga e encerramento. Em novas execuções, registre versão do jogo e resultados separadamente em 2025 e 2026. **A publicação permanece pendente da revisão de código e de autorização explícita; o relato manual não autoriza commit, push ou merge.**

Sugestão de commit, somente quando autorizado: `feat(telemetry): decode real UDP telemetry for F1 25 formats 2025 and 2026`.
