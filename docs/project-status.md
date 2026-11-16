# ROSSI Pitwall — estado do projeto e preservação técnica

## Identificação e referência preservada

| Item | Estado formalizado |
| --- | --- |
| Projeto | ROSSI Pitwall |
| Plataforma | Windows |
| Categoria | Monitor de telemetria e base de um futuro engenheiro de corrida |
| Jogo atualmente suportado | EA SPORTS F1 25 |
| Formatos UDP implementados | 2025 e 2026, limitados aos pacotes e campos efetivamente decodificados |
| Última entrega funcional | V0.3C-A |
| Estado | **Desenvolvimento ativo pausado — Technical Preview** |
| Data da formalização | 16/11/2026, referência de data: America/Sao_Paulo |
| Repositório | [andre-rossi-dev/rossi-pitwall](https://github.com/andre-rossi-dev/rossi-pitwall) |
| Integração funcional de referência | [PR #9](https://github.com/andre-rossi-dev/rossi-pitwall/pull/9), integrado à `main` em 16/11/2026 |
| Commit funcional preservado | [`240911ebe42a03eacc4c136d0497fd34cc6eb03d`](https://github.com/andre-rossi-dev/rossi-pitwall/commit/240911ebe42a03eacc4c136d0497fd34cc6eb03d) |

A versão permanece funcional dentro do escopo e das evidências registrados. A formalização encerra esta fase de desenvolvimento para F1 25, sem declarar o aplicativo completo, V1.0 ou lançamento comercial. Código, arquitetura, testes e decisões técnicas permanecem preservados para eventual retomada. Este documento é a referência de estado atual; os relatórios de validação continuam sendo registros históricos das respectivas etapas.

## Decisão de pausa estratégica

O usuário decidiu pausar o desenvolvimento ativo para priorizar recursos. A decisão não representa abandono, fracasso nem conclusão integral da visão original do produto. Os motivos registrados pelo usuário são:

1. A previsão de um próximo jogo completo da franquia em 2027 e a provável migração do usuário para F1 27 orientam seu planejamento. Essa expectativa não estabelece um compromisso de lançamento ou retomada do Pitwall.
2. A compatibilidade técnica futura ainda é desconhecida. Antes de conhecer o novo jogo, o usuário considera desvantajoso investir mais meses em funcionalidades específicas do F1 25.
3. A prioridade passa a ser projetos comerciais com maior potencial de geração de renda.
4. O projeto já proporcionou aprendizado significativo em arquitetura de software, integração UDP, desenvolvimento assistido por Codex, testes, Git e GitHub.

Novas funcionalidades estão suspensas, sem prazo obrigatório de retomada. Não se presume troca de engine, necessidade de reescrita completa ou compatibilidade automática com F1 27. Qualquer continuidade funcional exige autorização explícita e avaliação técnica prévia.

## Histórico de desenvolvimento

As oito entregas abaixo foram conferidas no histórico local e nos PRs integrados. Os commits identificam o estado integrado de cada etapa; os relatórios preservam também limitações e pendências existentes antes dos respectivos merges.

| Entrega | Avanço principal | PR / commit integrado | Registro técnico |
| --- | --- | --- | --- |
| V0.1 | Fundação Electron/React/TypeScript, simulador determinístico e IPC tipado | [#1](https://github.com/andre-rossi-dev/rossi-pitwall/pull/1) · `f2d0604` | [README no commit da fundação](https://github.com/andre-rossi-dev/rossi-pitwall/blob/f2d0604082bc40ebbd16e555d418107733750637/README.md); sem relatório próprio em `docs/` |
| V0.2A | Recepção UDP local, diagnóstico e inspeção de cabeçalhos 2025/2026 | [#2](https://github.com/andre-rossi-dev/rossi-pitwall/pull/2) · `17f39b8` | [Validação V0.2A](validation-v0.2a.md) |
| V0.2B | Velocidade, marcha e volta reais; seleção real/simulado e expiração | [#4](https://github.com/andre-rossi-dev/rossi-pitwall/pull/4) · `d16a276` | [Validação V0.2B](validation-v0.2b.md) |
| V0.2C-A | Integridade temporal por grupo, preservação de retrocessos em flashbacks e confirmação de identidade | [#5](https://github.com/andre-rossi-dev/rossi-pitwall/pull/5) · `4fb96f8` | [Validação V0.2C-A](validation-v0.2c-a.md) |
| V0.2C-B | Contexto de sessão/circuito, vínculos lógicos e transições defensivas | [#6](https://github.com/andre-rossi-dev/rossi-pitwall/pull/6) · `054328d` | [Validação V0.2C-B](validation-v0.2c-b.md) |
| V0.3A | Compostos real/visual, idade e desgaste individual dos pneus | [#7](https://github.com/andre-rossi-dev/rossi-pitwall/pull/7) · `df10ec1` | [Validação V0.3A](validation-v0.3a.md) |
| V0.3B | Combustível e ERS, com atualização conjunta dos campos do Car Status | [#8](https://github.com/andre-rossi-dev/rossi-pitwall/pull/8) · `24540cd` | [Validação V0.3B](validation-v0.3b.md) |
| V0.3C-A | Posição do jogador e diferenças para carro à frente/líder, fornecidas pelo Lap Data | [#9](https://github.com/andre-rossi-dev/rossi-pitwall/pull/9) · `240911e` | [Validação V0.3C-A](validation-v0.3c-a.md) |

O [PR #3](https://github.com/andre-rossi-dev/rossi-pitwall/pull/3), commit `1842732`, introduziu as instruções permanentes de AGENTS.md; foi uma entrega documental, não uma nona versão funcional.

## Funcionalidades disponíveis

- Aplicativo desktop Electron com interface React em português brasileiro, janela redimensionável e operação local/offline, sem serviços obrigatórios de nuvem ou IA paga.
- Um receptor UDP local no Main, com porta configurável, estados de recepção, contadores de pacotes/bytes, inspeção defensiva de cabeçalhos e diagnóstico de erros.
- Simulador independente e determinístico, explicitamente identificado como fictício. Dados simulados nunca preenchem medições reais ausentes.
- Telemetria do jogador primário, selecionado por `playerCarIndex`, nos formatos UDP 2025/2026 conforme a tabela abaixo.
- Expiração, indicação de indisponibilidade e tratamento de dados parciais; políticas defensivas de ordenação, flashbacks e transições de identidade.
- Testes automatizados Vitest, fixtures sintéticas identificadas e integração com Electron real por `scripts/smoke.cjs`.

| Pacote decodificado | Campos/domínios disponíveis |
| --- | --- |
| ID 1 — Session Data | Tipo de sessão, circuito e vínculos de temporada/fim de semana/sessão, separados da identidade técnica |
| ID 2 — Lap Data | Volta, posição do jogador, parcelas dos deltas para carro à frente/líder e estado de resultado usado na apresentação |
| ID 6 — Car Telemetry | Velocidade e marcha |
| ID 7 — Car Status | Compostos real/visual, idade dos pneus, combustível atual/capacidade/estimativa do MFD, energias e modo ERS; limite de recuperação por volta somente em 2026 |
| ID 10 — Car Damage | Percentual de desgaste de cada pneu |

Os parsers implementados exigem `packetVersion = 1` e validam formato, tamanho e índice antes de ler os campos. Isso não equivale a suporte completo aos pacotes ou ao protocolo. Inspeção de cabeçalho reconhecido não valida todo o payload nem autentica a origem. Os layouts e campos exatos estão na [referência UDP](udp-protocol.md).

Posição e diferenças são exibidas conservadoramente quando há Lap Data e contexto de corrida disponíveis, jogador ativo e posição reconhecida. P1 mantém os dois gaps como não aplicáveis; valores ambíguos podem aparecer como `—`. O Pitwall apresenta os deltas recebidos, sem calcular gaps próprios ou identificar adversários.

## Arquitetura preservada

Electron, React, TypeScript, Node.js, electron-vite e Vitest permanecem como base técnica. As responsabilidades seguem a [arquitetura do README](../README.md#arquitetura) e as regras de [AGENTS.md](../AGENTS.md):

- **Main:** recursos privilegiados, janela, um receptor `node:dgram`, diagnóstico, parsers, fontes de telemetria e ciclo de vida. Encerramento de sockets/timers/inscrições e início/parada idempotentes são preservados.
- **Preload:** API restrita e tipada `window.pitwall`, com cancelamento individual das inscrições. Não expõe IPC genérico, datagramas brutos ou eventos privilegiados.
- **Renderer:** apresentação React, seleção real/simulado e cleanup das inscrições, sem acesso direto ao Node.js.
- **Shared:** contratos independentes de Electron e React, incluindo identidade, contexto, timing e disponibilidade. A fonte real e o simulador mantêm contratos distintos.

Permanecem `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webviewTag: false`, validação de janela/frame remetentes no Main, bloqueios de navegação, novas janelas e permissões, CSP de produção e Preload em bundle CommonJS único.

`packetFormat` identifica o protocolo; ano do jogo e pacote visual 2026 não substituem esse campo. A identidade técnica combina UID exato, formato e índice do jogador. A política de `overallFrameIdentifier` ordena cada grupo separadamente, sem comparação entre grupos ou identidades. Retrocessos de frame, tempo e volta continuam permitidos quando a ordem geral é aceita.

Há cinco grupos temporais. Volta/posição/diferenças compartilham ID 2; composto/idade/combustível/ERS compartilham ID 7. Cada grupo expira sem novas amostras aceitas; duplicações e atrasos não renovam frescor. Trocas confirmadas limpam os grupos anteriores. Silêncio UDP não comprova pausa nem limpa identidade. Políticas, limiares e limitações permanecem na [referência de protocolo](udp-protocol.md#sessão-publicação-e-frescor), sem sincronização obrigatória entre IDs.

## Evidências e validações

**Os resultados funcionais abaixo são históricos, não execuções desta formalização documental.** A fonte principal é o [relatório V0.3C-A](validation-v0.3c-a.md), complementado pelo [PR #9](https://github.com/andre-rossi-dev/rossi-pitwall/pull/9) para o estado posterior de revisão e integração.

| Tipo de evidência | Registro existente | Limite da evidência |
| --- | --- | --- |
| Testes automatizados | 464 testes aprovados em 13 arquivos na implementação da V0.3C-A | Fixtures sintéticas, inclusive testes com sockets locais; não são capturas nem validação do jogo real |
| Typecheck e build | Aprovados na implementação | Não foram repetidos nesta tarefa |
| Integração Electron | Três smokes aprovados: `receive`, `occupied` e `invalid` | Electron real com datagramas sintéticos; não substitui F1 25 real |
| Validação manual | 7/7 cenários aprovados, conforme relato do usuário de 15/11/2026, reafirmado na retomada de 16/11 | Observações funcionais do usuário; o agente não executou o jogo nem realizou medições próprias |
| Revisão técnica estática independente | Concluída antes do merge, sem bloqueios identificados, conforme registro do PR #9 | Revisão histórica; esta tarefa não realizou uma nova revisão independente |

Os sete cenários manuais abrangem posição/gaps, ultrapassagens/perda de posição, liderança, flashbacks, pausa/interrupção UDP, formatos 2025/2026 e outros modos/interface/simulador. O relato não confirma cada combinação de formato e caso-limite do roteiro. Pit stops, Safety Car, retardatários, voltas diferentes, deltas longos e resets ambíguos não receberam resultados específicos suficientes para afirmar cobertura individual.

O relatório V0.3C-A ainda descreve a revisão independente como pendente porque registra a etapa anterior ao merge. Esse texto histórico foi preservado. O PR #9 registra sua conclusão e a integração; README e este documento refletem esse estado posterior. Não se somam contagens de testes entre versões, nem se toma ausência de anomalias aparentes como prova de correção universal.

Nesta tarefa foram conferidos documentos, trechos relevantes de código/contratos/testes, histórico Git, PRs e referências. A entrega é exclusivamente documental: não foram repetidos testes automatizados, typecheck, build, smoke, inspeção gráfica ou validação manual com o jogo. O smoke com servidor de desenvolvimento também consta como não executado no relatório da última entrega. Compatibilidade com F1 27 não foi testada.

## Limitações conhecidas

- **Gaps e condições especiais:** deltas podem ser ambíguos em largada, transições, pit stops, Safety Car, retardatários e voltas diferentes. Não há cálculo próprio, garantia de equivalência contínua ao HUD, identificação de oponentes ou conversão em voltas de atraso.
- **Independência temporal:** grupos UDP distintos podem representar instantes diferentes. Campos do mesmo ID 2 ou ID 7 permanecem juntos; não há sincronização global ou reconciliação histórica completa de flashbacks.
- **UIDs substituídos:** a proteção conserva apenas os oito últimos UIDs em memória. UID ainda retido pode bloquear uma retomada legítima; UID removido da fila ou uma sequência coerente desconhecida ainda pode assumir. Não há autenticação de remetente ou proteção universal contra atrasos.
- **Resets e ordem ambígua:** comparação modular pressupõe distância inferior a meia faixa uint32. Duplicações, atrasos e meia faixa não avançam; resets inesperados na mesma identidade não têm recuperação automática. Silêncio não resolve ambiguidade.
- **Contexto contraditório:** pode ficar indisponível até troca técnica confirmada ou reinício; os vínculos lógicos não criam histórico nem dispensam confirmação de identidade.
- **Persistência:** não há histórico persistente de sessões/stints, gravação, replay ou reconciliação histórica completa.
- **Combustível e energia:** estimativa do MFD não é previsão própria. Convenções de unidades e escalas conservam as ressalvas da [V0.3B](validation-v0.3b.md) e do [protocolo](udp-protocol.md#combustível-e-ers--v03b); a validação relatada sem addons energéticos não comprova calibração universal ou comportamento com tais addons.
- **Intermitência gráfica:** `UnknownVizError` ocorreu em smokes históricos. A [V0.2C-B](validation-v0.2c-b.md#falhas-gráficas-e-limitações-da-evidência) localizou uma ocorrência em `webContents.capturePage()`, sem comprovar causa ou resolução definitiva. Aprovações posteriores não encerram essa ressalva.
- **Cobertura e compatibilidade:** não se garante ausência de perdas UDP, latência, sincronização perfeita, suporte integral ao protocolo ou compatibilidade com F1 27. Esta última permanece não verificada.

## Funcionalidades não implementadas — roadmap suspenso

- Histórico persistente de sessões e stints.
- Motor de estratégias e recomendações de pit stop.
- Predição de desgaste e degradação.
- Comparação avançada de ritmo e análise de tráfego.
- Clima e previsão de chuva.
- Interpretação de Safety Car, VSC e bandeiras.
- Leaderboard completo.
- Rádio inteligente em português brasileiro.
- Overlay.
- Distribuição pública com instalador.
- Reconciliação histórica completa de flashbacks.

Esses itens são possibilidades de continuidade suspensas, sem compromisso de entrega. V0.3C-B não foi iniciada nesta tarefa. Recursos não decodificados continuam fora do escopo mesmo quando seus campos existem nos pacotes recebidos.

## Roteiro de avaliação e possível retomada para F1 27

Quando o jogo estiver disponível e houver autorização para retomar:

1. Consultar fontes oficiais sobre o novo jogo e registrar versões, plataformas e informações efetivamente confirmadas.
2. Localizar as especificações UDP correspondentes, caso disponibilizadas.
3. Confirmar formatos e versões de pacotes suportados; não deduzi-los pelo nome comercial ou temporada visual.
4. Comparar cabeçalhos, IDs, tipos, tamanhos, offsets e semântica com a referência preservada.
5. Avaliar diferenças nos sistemas de energia, pneus, corrida e sessões.
6. Investigar flashbacks, pausas, resets de contadores e mudanças/reutilização de identidade.
7. Identificar parsers reaproveitáveis e quais validações precisam mudar.
8. Identificar contratos Shared e interfaces que precisarão de adaptação.
9. Preservar arquitetura, isolamento e testes existentes quando tecnicamente viável, mantendo o comportamento F1 25 como referência explícita.
10. Criar fixtures sintéticas próprias para o novo protocolo, identificadas e fundamentadas nas especificações confirmadas.
11. Validar dados reais diretamente no F1 27, distinguindo resultados observados de hipóteses e cobertura sintética.
12. Somente depois definir o roadmap de continuidade, esforço e prioridades com o usuário.

Nenhuma compatibilidade especulativa foi implementada. A avaliação pode concluir por reaproveitamento, adaptações ou outras decisões justificadas por evidências; não parte da premissa de reconstruir todo o aplicativo.

## Recuperação do ambiente e do estado Git

Antes de qualquer retomada, ler este documento e [AGENTS.md](../AGENTS.md), inspecionar branch, staging, modificações e arquivos não rastreados, preservando alterações locais. Consultar o [README](../README.md) para os procedimentos mantidos no repositório:

| Necessidade | Referência |
| --- | --- |
| Pré-requisitos e versões do ambiente | [Stack e pré-requisitos](../README.md#stack-e-pré-requisitos) |
| Clonar, instalar dependências e iniciar em desenvolvimento | [Instalação e execução](../README.md#instalação-e-execução) |
| Executar testes, typecheck, build e iniciar produção | [Verificações e compilação](../README.md#verificações-e-compilação) |
| Integração gráfica e seus requisitos | [Verificações e compilação](../README.md#verificações-e-compilação) e relatórios de validação |
| Conectar o F1 25 localmente | [Configurar UDP no F1 25](../README.md#configurar-udp-no-f1-25) |
| Arquitetura, contratos e documentação técnica | [Arquitetura](../README.md#arquitetura), [protocolo UDP](udp-protocol.md) e relatórios ligados no histórico acima |

A instalação de dependências pode exigir internet; a operação do aplicativo permanece local/offline. `package.json` e `package-lock.json` preservam scripts e dependências; não substituir o lockfile por versões atuais sem uma tarefa autorizada de atualização.

Para inspecionar o estado funcional preservado, usar o commit completo indicado no início. `git show 240911ebe42a03eacc4c136d0497fd34cc6eb03d` permite consultar a integração sem alterar a árvore. Se for necessário executar exatamente essa revisão no futuro, em um clone limpo e após conferir o estado local, `git switch --detach 240911ebe42a03eacc4c136d0497fd34cc6eb03d` seleciona o commit sem mover a `main`; o modo detached significa que nenhuma branch de trabalho está selecionada. Uma futura implementação autorizada deverá usar branch própria, conforme AGENTS.md. Não usar reset destrutivo para recuperar o projeto.

O commit funcional antecede esta documentação de pausa. Para recuperar também o contexto documental, localizar no histórico Git os commits que versionam estes três arquivos e consultar o PR da branch `docs/f1-25-development-freeze` para verificar o estado de sua integração à `main`. A referência funcional do PR #9 e o histórico da documentação de congelamento são distintos; esta formalização não faz parte daquele commit funcional.

## Versionamento e limites desta formalização

**V0.3C-A** é o identificador funcional exibido pela interface e pela documentação. O metadado `version` de `package.json` permanece **`0.2.0-alpha.2`**, e sua descrição ainda menciona V0.2B. Essa divergência existente não indica reversão da implementação. `package.json` e `package-lock.json` não foram alterados; não se declarou V1.0 nem uma versão comercial completa.

Esta formalização foi preparada na branch `docs/f1-25-development-freeze`, baseada no commit funcional preservado, e se limita a `docs/project-status.md`, `README.md` e `AGENTS.md`. Nenhuma alteração funcional faz parte do encerramento: código, testes, fixtures, scripts, dependências e interface permanecem preservados. O versionamento e a integração desta documentação não constituem uma nova versão funcional nem distribuição com instalador. A criação de tag ou GitHub Release exige autorização separada; uma tag de referência poderá ser considerada após a integração final da documentação.
