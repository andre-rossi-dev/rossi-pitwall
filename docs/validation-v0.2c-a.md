# Validação V0.2C-A — integridade temporal UDP

Data: **14/11/2026**. Branch: `feat/v0.2c-temporal-integrity`. Validação manual com o F1 25 real relatada pelo usuário nos seis cenários abaixo. Commit e push exclusivamente desta branch autorizados; revisão técnica independente pendente antes do merge.

## Preparação e referências

- Árvore inicialmente limpa em `main`. Após `git fetch origin`, `main` e `origin/main` apontavam para `d16a276d01d6181f5b61f30bb167517c036fa6fc` (`feat: adiciona telemetria real UDP 2025 e 2026`). A V0.2B está integrada; não foi necessário avançar a main nem fazer merge. A branch solicitada foi criada dessa base.
- AGENTS.md, README, protocolo, validação V0.2B, receptor, inspeção, decoder, fonte real, contratos, fixtures, testes e smoke foram inspecionados. Baseline desta execução: **107 testes aprovados em 6 arquivos**.
- Os anexos TXT oficiais EA 2025/2026 foram consultados novamente. Ambos documentam `overallFrameIdentifier` como contador que não retrocede após flashbacks; tipos e offsets dos seis campos investigados coincidem. Fontes primárias e derivação estão em [Protocolo UDP](udp-protocol.md).
- O primeiro fetch foi impedido pela sandbox ao gravar `.git/FETCH_HEAD`; a repetição com permissão ampliada concluiu com código 0. A branch e os smokes gráficos também usaram a permissão necessária. Isso não foi uma falha de produto.

## Implementação e justificativa

`decodeTelemetry` agora inclui `overallFrameId` nos metadados tipados de cada grupo. A leitura ocorre após as validações existentes de formato, versão, comprimento exato e carro. Não houve mudança no inspetor de cabeçalho nem na política do diagnóstico.

`RealTelemetrySource` compara o contador geral separadamente para velocidade/marcha e volta. A diferença modular uint32 precisa ser positiva e menor que meia faixa. Empates, atrasos e a distância ambígua de meia faixa são ignorados, sem renovar frescor. Assim, wraparound próximo de `0xffffffff → 0` é aceito e frame/tempo/volta menores continuam permitidos quando o contador geral avança. O operador `>>> 0` converte a diferença para uint32; não compara timestamps nem infere progresso por tempo local.

A primeira identidade assume imediatamente. Mudanças posteriores exigem duas amostras com avanço **no mesmo grupo**, dentro de 1000 ms da candidatura. O outro grupo pode estar ausente ou em frame diferente. Amostra aceita da identidade ativa cancela a candidatura; terceira identidade a substitui. A confirmação limpa os dois grupos anteriores e aplica somente as amostras candidatas, mantendo seus instantes de recepção.

Uma fila em memória retém os oito últimos UIDs substituídos por outro UID e bloqueia seus pacotes. A confirmação reduz trocas por pacote isolado; a fila também protege contra rajadas de sessões recentemente substituídas. Mudanças apenas de formato/carro não aposentam o UID, permitindo ida e volta de formato. A memória é limitada a dois grupos ativos, até dois pacotes decodificados candidatos e oito strings de UID; não armazena buffers nem histórico persistente.

Frescor independente de 3000 ms e publicação a até 10 Hz permanecem. Silêncio, expiração e diagnóstico `idle` não removem identidade nem referências de ordem. Uma nova amostra aceita retoma cada grupo; duplicação não revalida dado vencido. Início/reinício, erro ou parada do receptor e parada da fonte limpam o estado temporal. A recarga do Renderer preserva o estado Main e o socket.

Não houve alteração no Renderer, receptor UDP, Main de integração, Preload, canais IPC, segurança, simulador ou dependências. Os metadados de pacote permanecem na versão existente. A implementação inicial foi entregue sem commit ou push; a autorização posterior de publicação da branch está registrada abaixo.

## Verificações automatizadas da implementação inicial

Resultados das execuções anteriores ao relato manual. Não representam novas execuções durante a revisão documental para publicação.

| Verificação | Resultado real |
| --- | --- |
| Baseline `npm run test` | 107 testes aprovados, 6 arquivos, código 0 |
| Testes específicos do parser/fonte | **84 testes aprovados**, 2 arquivos, código 0 |
| `npm run typecheck` | Aprovado, código 0 |
| `npm run test` após implementação | **135 testes aprovados**, 6 arquivos, código 0 |
| `npm run build` | Aprovado, código 0; inclui checagem de tipos, Main, Preload CommonJS e Renderer |
| `node --check scripts/smoke.cjs` | Aprovado, código 0 |
| Electron smoke `receive` | `SMOKE OK (receive)`, código 0 |
| Electron smoke `occupied` | `SMOKE OK (occupied)` |
| Electron smoke `invalid` | `SMOKE OK (invalid)`; sequência dos dois cenários concluída com código 0 |
| Revisão final e `git diff --check` | Aprovados; arquivo novo também conferido separadamente |
| F1 25 real | Não executado pelo agente; estava pendente nesta etapa. Relato posterior do usuário registrado na seção seguinte |
| Smoke no servidor de desenvolvimento | Não executado; integração usa build de produção |

Os novos testes determinísticos cobrem ordem normal, atraso, duplicação inclusive com payload conflitante, grupos independentes, flashback com retrocesso de volta, limites uint32 e meia faixa ambígua, silêncio prolongado e retomada, confirmação/expiração/substituição de candidata, UIDs antigos, precisão uint64, limpeza e limite da fila, alternância bidirecional de formato e preservação dos instantes de recepção. O ciclo de vida, cancelamentos, sockets, ponte e simulador continuam cobertos pela suíte completa. As fixtures são sintéticas e controlam frame e contador geral independentemente.

O smoke de recepção percorre o fluxo UDP local → Main → Preload → React. Testa 2025 → 2026 → 2025 → 2026, confirma nova sessão com contador menor, rejeita duplicação conflitante e atraso, aceita flashback sintético e impede retorno por rajada de UID substituído. Confere ainda R/N, dados parciais, rejeição de payload truncado, cancelamento IPC, persistência dos contadores/estado na recarga, expiração, duplicação após silêncio, retomada e simulador contínuo. Mantém as verificações de segurança e largura mínima. Capturas ficam em `.smoke-profile/`, ignorado pelo Git.

Os cenários `occupied` e `invalid` também passaram, preservando indicação do erro de configuração/porta e simulador ativo. Nenhuma falha de teste foi observada nas verificações acima. O `UnknownVizError` histórico das entregas anteriores não apareceu nos três smokes desta execução; não houve correção específica nem evidência de resolução definitiva. Seu histórico permanece em [Validação V0.2A](validation-v0.2a.md) e [Validação V0.2B](validation-v0.2b.md).

## Validação manual com o F1 25 real — relato do usuário

Relato recebido em **14/11/2026**. O usuário informou ter concluído com sucesso os seis cenários abaixo no F1 25 real. São observações do usuário, separadas dos testes sintéticos e das verificações automatizadas; o agente não executou o jogo.

| Cenário | Resultado relatado pelo usuário |
| --- | --- |
| Telemetria normal em UDP 2025 e 2026 | Indicadores funcionando corretamente |
| Flashbacks | Retrocessos de volta e telemetria acompanhados corretamente, sem anomalias observadas |
| Pausa e Alt+Tab | Expiração e retomada da telemetria funcionando normalmente |
| Mudança de sessão | Transição sem mistura perceptível de informações antigas |
| Troca de protocolo | Alternância entre UDP 2025 e 2026 funcionando |
| Retomada de save | Telemetria retomada normalmente, sem bloqueios ou congelamentos observados |

O usuário não observou travamentos, congelamentos ou comportamentos estranhos durante esses testes. O relato fornece evidência de funcionamento nos cenários observados, **não medição automatizada, prova de funcionamento universal ou garantia de ausência de defeitos**.

Não foram informados versão/build exatos do jogo, duração e quantidade de repetições, taxa UDP, índice do jogador, UIDs ou contadores antes/depois dos eventos. O relato não detalha cada cenário por formato, além de confirmar telemetria em ambos e alternância entre eles. Não foram fornecidas capturas binárias nem medições de latência/perda.

A retomada de save bem-sucedida não comprova que o jogo reutilizou um UID presente na fila de bloqueio, nem que houve reset do contador na mesma identidade. Da mesma forma, as observações de flashbacks e troca de sessão não comprovam tratamento universal de atrasos, duplicações, wraparound ou reconciliação completa. As limitações técnicas abaixo permanecem válidas. O relato não confirma todos os passos adicionais do roteiro, como recarga do Renderer, troca de índice do jogador e encerramento/liberação da porta.

## Revisão documental e autorização de publicação — 14/11/2026

O usuário autorizou o commit `feat: aprimora integridade temporal UDP e sessões` e push exclusivamente da branch `feat/v0.2c-temporal-integrity`. Não autorizou merge, exclusão de branches ou avanço para a V0.2C-B. A revisão técnica independente ocorrerá após a publicação, antes do merge.

Nesta etapa, as edições se limitam a este registro e ao README para incorporar o relato e atualizar o estado da entrega. O código, os testes e o smoke da implementação inicial foram revisados e preservados. Não houve necessidade de nova alteração de código; por isso, typecheck, suíte completa, build e integração gráfica não foram repetidos. Seus resultados anteriores permanecem identificados na seção de verificações automatizadas.

O diff completo e os 11 arquivos da entrega, incluindo este documento novo, foram revisados. Não foram identificadas credenciais na leitura ou na busca por padrões comuns. Compilados e artefatos locais não integram o conjunto a versionar: `out/`, `.smoke-profile/` e `node_modules/` permanecem ignorados. `git diff --check` foi executado novamente sem erros de whitespace; a conferência do conteúdo preparado para commit inclui também o arquivo novo.

## Limitações técnicas preservadas

- A documentação da EA não especifica política de empate/overflow nem garante entrega UDP. Comparação modular, janela e fila são decisões locais. Distâncias reais de meia faixa ou mais, voltas completas sem observação e resets inesperados do contador na mesma identidade não são resolvidos automaticamente.
- A primeira identidade pode ser estabelecida por um pacote atrasado. Rajadas coerentes de identidade desconhecida, de UID removido da fila ou de formato/carro anterior sob o mesmo UID podem confirmar uma troca. Não há autenticação ou garantia absoluta de ordenação/sessão.
- Retomar um save que reutilize UID ainda bloqueado não reativa essa sessão até o UID sair da fila ou o receptor/fonte reiniciar. A EA descreve UID único; houve relato de retomada de save sem bloqueios, mas não foram observados os UIDs para verificar reutilização. A fila não expira por silêncio, evitando reabrir a aceitação de sessões antigas durante Alt+Tab.
- Confirmação exige avanço no mesmo ID dentro de um segundo. Fluxo muito esparso, contador parado ou identidades intercaladas podem adiar uma troca legítima. Formato e carro podem voltar sem bloqueio por UID, mediante confirmação.
- Pacotes com mesmo contador não renovam métricas, mesmo que o jogo os envie durante uma pausa. O diagnóstico pode mostrar tráfego enquanto os valores reais estão vencidos. Essa diferença é intencional; o relato de pausa/retomada bem-sucedida não informa se houve envio com contador repetido.
- Não há reconciliação completa de flashbacks: os grupos podem representar instantes diferentes até ambos atualizarem. Não se exige frame comum nem se usam voltas/tempo para rejeitar dados.
- Não foram obtidas capturas binárias reais, medições de latência/perda ou prova de comportamento em todos os modos do jogo. O relato manual da V0.2B permanece histórico; o relato específico da V0.2C-A acima valida somente os cenários observados, sem eliminar estas limitações.

## Procedimento manual recomendado

1. Execute `npm run build` e `npm start`. Configure UDP local como no [README](../README.md#configurar-udp-no-f1-25), inicialmente em 2025, e selecione UDP REAL.
2. Compare velocidade, marchas R/N/1–8 e volta com o HUD; verifique carro parado e cruzamento de linha. Repita em 2026.
3. Faça flashbacks repetidos, incluindo retorno à volta anterior, e observe atualização e ausência de restauração indevida do estado pré-flashback. Registre congelamentos ou divergências por formato.
4. Pause/retome, use Alt+Tab e teste interrupção explícita do UDP por mais de três segundos. Confira expiração e retomada sem reiniciar o aplicativo; a identidade deve persistir em silêncio.
5. Troque de sessão e alterne 2025 → 2026 → 2025. Confira confirmação da identidade e que nenhum grupo antigo aparece misturado com a nova. Se possível, teste mudança do índice do jogador e retorno.
6. Recarregue o Renderer durante recepção e após interrupção, alterne real/simulado, feche e reabra. Confirme preservação do estado na recarga, distinção dos dados fictícios e liberação da porta ao encerrar.
7. Teste retomada de save, se aplicável, anotando UID observado e possíveis travamentos de atualização. Não interprete comportamento não observado como garantia de UID novo ou continuidade do contador.
8. Registre versão/build do jogo, formato observado, taxa de envio, índice/UID, sequência e duração das ações e resultados separadamente por formato. O HUD não comprova duplicações, atrasos ou wraparound; esses cenários têm evidência sintética nesta entrega.

## Arquivos modificados

| Arquivo | Alteração |
| --- | --- |
| `src/main/telemetry/RealTelemetrySource.ts` | Ordem por grupo, candidata e proteção limitada de UIDs |
| `src/main/udp/decodeTelemetry.ts` | Leitura do contador geral após validações |
| `src/shared/realTelemetry.ts` | Metadado tipado `overallFrameId` |
| `tests/fixtures/f1-telemetry.ts` | Contador geral independente nas fixtures |
| `tests/real-telemetry-parser.test.ts` | Offsets e limites do novo metadado |
| `tests/real-telemetry-source.test.ts` | Política temporal, identidade e manutenção dos testes de ciclo de vida |
| `scripts/smoke.cjs` | Cenários temporais e adaptação à confirmação |
| `docs/udp-protocol.md` | Semântica, política, parâmetros e limites |
| `docs/validation-v0.2c-a.md` (novo) | Evidências e roteiro desta entrega |
| `README.md` | Escopo atual, frescor e roteiro manual |
| `AGENTS.md` | Regras permanentes coerentes com a integridade temporal |

Mensagem de commit autorizada: `feat: aprimora integridade temporal UDP e sessões`.
