# Registro de validação — V0.2A

Registro inicial: 13/11/2026. Atualização com o relato da validação real: 14/11/2026. Ambiente automatizado: Windows, Node.js 24.14.0, npm 10.8.2.

## Preparação

- `main` estava limpa, no commit `f2d0604`.
- Após `git fetch origin main`, `git rev-list --left-right --count main...origin/main` retornou `0 0`.
- Branch criada: `feat/v0.2-udp-receiver`.
- README, package.json, Main, Preload, contratos, interface e testes existentes foram lidos antes das alterações.
- Baseline: 16 testes aprovados em 2 arquivos.
- Na preparação e nas validações automatizadas iniciais, não foram feitos commit, push ou merge.

## Resultados efetivamente obtidos

Na retomada final de 14/11/2026, os 20 arquivos da entrega foram revisados na branch `feat/v0.2-udp-receiver`. Foram executados novamente `npm run typecheck`, `npm run test`, `npm run build`, os três cenários de `npm run test:smoke` e `git diff --check`, todos com código de saída 0. Nenhuma alteração na implementação ou no smoke test foi necessária nesta etapa.

| Verificação | Resultado |
| --- | --- |
| `npm run test` na revisão final de 14/11/2026 | **49 testes aprovados**, 4 arquivos; duração reportada: 1,13 s |
| `npm run typecheck` | **Aprovado**, código de saída 0 |
| `npm run build` | **Aprovado**, incluindo nova verificação de tipos e bundles Main/Preload/Renderer |
| `node --check scripts/smoke.cjs` | **Aprovado** — sintaxe apenas |
| `git diff --check` | **Aprovado**, sem problemas de whitespace |
| Diff de SimulatedTelemetrySource, shared/telemetry e testes do simulador | **Sem alterações** |
| Smoke Electron final, modo `receive` | **Aprovado**, `SMOKE OK (receive)`, código de saída 0 |
| Smoke Electron, modo `occupied` | **Aprovado na sequência final**, `SMOKE OK (occupied)`, código de saída 0 |
| Smoke Electron, modo `invalid` | **Aprovado**, `SMOKE OK (invalid)`, código de saída 0 |
| Validação com F1 25 real | **Realizada pelo usuário**, formatos UDP 2025 e 2026; observações registradas abaixo |

Os testes automatizados usam sockets UDP locais reais com conteúdo sintético. Seus resultados são distintos das observações com o F1 25 real relatadas pelo usuário na seção seguinte.

A revisão do inventário e a busca por padrões de credenciais não encontraram ocorrências nos arquivos destinados ao versionamento. Os diretórios `out/` e `.smoke-profile/`, incluindo as capturas dos testes, permanecem ignorados pelo Git. A implementação do simulador, seu contrato de telemetria e seus testes continuam sem alterações. A publicação está restrita à branch de trabalho, sem merge ou exclusão de branches.

## Validação manual com o F1 25 real

Relato recebido do usuário em **14/11/2026**, após concluir dois testes com o jogo real, usando os formatos UDP **2025** e **2026**. Os valores abaixo são os totais observados no painel após os dois testes, não resultados de fixtures sintéticas nem de uma execução do jogo pelo agente.

| Observação no ROSSI Pitwall | Valor relatado |
| --- | --- |
| Endereço | `127.0.0.1:20777` |
| Total de pacotes recebidos | 48.635 |
| Total de bytes recebidos | 48.049.417 |
| Cabeçalhos 2025 | 30.207 |
| Cabeçalhos 2026 | 18.428 |
| Cabeçalhos inválidos | 0 |
| Formatos não suportados | 0 |
| Último formato | 2026 |
| Último ID de pacote | 3 |
| Versão do pacote | 1 |

O usuário também observou a mensagem de ausência de datagramas após interromper a transmissão. Não foi informada uma medição do tempo até essa mensagem.

O relato confirma a recepção e a identificação dos dois formatos no cenário testado. **Não comprova ausência de perda de pacotes**: os contadores representam o que chegou ao receptor, sem comparação com a quantidade enviada pelo jogo. Zero inválidos significa que os cabeçalhos recebidos passaram pelas verificações limitadas da V0.2A; não certifica o conteúdo completo dos pacotes.

**Não houve interpretação de dados de pilotagem.** A implementação inspeciona cabeçalhos e mantém velocidade, marcha e volta simuladas. A versão/build do jogo, a duração de cada teste e a taxa de envio utilizada não foram informadas. Nenhuma captura binária real foi fornecida ou incorporada ao repositório; as fixtures existentes continuam explicitamente sintéticas.

## Tentativas de integração gráfica

1. A primeira execução abriu o Electron, passou pelas verificações da simulação/isolamento e falhou esperando o estado inicial UDP. Foi identificada uma corrida entre o envio em `did-finish-load` e a inscrição do React. A correção adiciona uma solicitação restrita de snapshot após instalar o listener do Preload. Há teste automatizado da ordem de inscrição/solicitação.
2. A segunda execução confirmou **Aguardando datagramas** na interface e a simulação ativa. O smoke então falhou com `An object could not be cloned`: o script de verificação retornava a função de cancelamento de `executeJavaScript`. O script foi corrigido para retornar um valor serializável.
3. A solicitação para executar novamente os três cenários gráficos foi inicialmente recusada na ferramenta de permissões (`rejected by user`). O usuário esclareceu que a recusa foi acidental e autorizou a retomada.
4. Na retomada, `npm run build` passou novamente, incluindo o typecheck. Os três cenários foram executados no Electron: `receive` e `invalid` passaram com código 0; `occupied` exibiu corretamente `EADDRINUSE` e manteve a simulação, mas terminou com o erro gráfico `UnknownVizError`, código 1.
5. O cenário `occupied` foi repetido isoladamente, sem qualquer alteração de código, e passou integralmente com código 0. O erro gráfico não se reproduziu nessa execução. A causa exata não foi determinada; uma repetição aprovada não comprova resolução definitiva.
6. Na retomada final de 14/11/2026, após novo build, os cenários `receive`, `occupied` e `invalid` foram executados em sequência e todos imprimiram `SMOKE OK`, com código de saída 0. O `UnknownVizError` não reapareceu nessa sequência. Não houve correção específica para esse erro, que permanece registrado como ocorrência intermitente de causa não determinada para acompanhamento na revisão técnica.

## Conclusão da integração automatizada

**Os três cenários passaram na sequência final de 14/11/2026.** A falha gráfica de uma execução anterior do cenário de porta ocupada continua registrada, sem conclusão de que esteja definitivamente resolvida. A aprovação descreve os resultados efetivamente obtidos na execução final; não garante ausência de intermitência futura. Nenhuma alteração na implementação ou no smoke test foi necessária nesta retomada; somente este registro foi atualizado.

| Cenário | Evidências da execução aprovada |
| --- | --- |
| Recepção UDP sintética | Estado inicial, fixture de 29 bytes, formato 2026/ID 16, contadores na interface, preservação após recarga e indicação de silêncio após 3 segundos |
| Porta ocupada | `EADDRINUSE` exibido, telemetria simulada preservada e recarga concluída |
| Configuração inválida | Erro de `ROSSI_UDP_PORT` exibido, telemetria simulada preservada e recarga concluída |

Em todos os cenários aprovados, o script verificou sandbox, isolamento, API restrita, continuidade da simulação, ausência de erros de console/preload e ausência de overflow horizontal na largura mínima. As janelas foram fechadas pelo teste e os comandos terminaram com código 0. As capturas geradas estão em `.smoke-profile/udp-receive.png`, `.smoke-profile/udp-occupied.png` e `.smoke-profile/udp-invalid.png` (arquivos locais ignorados pelo Git).

A validação manual de recepção com os dois formatos foi posteriormente relatada pelo usuário e está registrada separadamente acima. As execuções de integração descritas nesta seção não envolveram o jogo real.

## Como repetir a integração e prosseguir para o jogo

Em uma sessão gráfica do Windows:

```powershell
$env:ELECTRON_RUN_AS_NODE = $null
npm run build
$env:ROSSI_SMOKE_UDP_MODE = $null
npm run test:smoke
$env:ROSSI_SMOKE_UDP_MODE = 'occupied'
npm run test:smoke
$env:ROSSI_SMOKE_UDP_MODE = 'invalid'
npm run test:smoke
$env:ROSSI_SMOKE_UDP_MODE = $null
```

Cada execução deve imprimir `SMOKE OK`, retornar código zero e fechar o Electron. O teste usa porta efêmera, ajusta `ROSSI_UDP_PORT` apenas em seu próprio processo e não altera as configurações do jogo. Os cenários de erro devem manter o simulador ativo.

Depois siga a seção **Validação V0.2A com o jogo** do [README](../README.md). Registre versão do F1 25, configuração UDP, formato observado, ID e contadores. Valide abertura/fechamento, recarga, silêncio/retomada e legibilidade nos tamanhos de janela indicados.

## Arquivos da entrega

| Arquivos | Alteração |
| --- | --- |
| `src/main/udp/UdpReceiver.ts` | Novo receptor, ciclo de vida e diagnóstico |
| `src/main/udp/config.ts` | Endereço padrão e porta por variável de ambiente |
| `src/main/udp/inspectHeader.ts` | Leitura defensiva do cabeçalho |
| `src/shared/udp.ts` | Contratos tipados independentes de Electron/React |
| `src/main/index.ts` | Integração, IPC com validação de remetente e encerramento aguardado |
| `src/shared/ipc.ts`, `src/preload/index.ts` | Inscrição restrita e solicitação do estado inicial |
| `src/renderer/src/UdpDiagnostics.tsx` | Painel de diagnóstico separado |
| `src/renderer/src/App.tsx`, `src/renderer/src/styles.css` | Integração visual, textos e estilos discretos |
| `tests/udp-header.test.ts`, `tests/udp-receiver.test.ts` | Novos testes de configuração, cabeçalho e transporte |
| `tests/fixtures/f1-header.ts` | Fixture sintética documentada |
| `tests/preload.test.ts` | Cobertura da nova inscrição e preservação dos testes existentes |
| `scripts/smoke.cjs` | Cenários de recepção/erro no Electron, mantendo verificações V0.1 |
| `package.json`, `package-lock.json` | Metadados V0.2A (`0.2.0-alpha.1`); nenhuma dependência adicionada/atualizada |
| `README.md` | Configuração, arquitetura, limites e validação manual |
| `docs/udp-protocol.md` | Fontes EA, offsets e política de inspeção |
| `docs/validation-v0.2a.md` | Este registro de resultados e pendências |

## Limites

Apenas recepção local e inspeção do cabeçalho. Não há parser de payload, métricas reais de corrida, envio UDP em produção, comandos/injeção no jogo, persistência, replay ou recursos das próximas entregas. Cabeçalho reconhecido não certifica um pacote completo nem sua origem. O silêncio de 3 segundos é um diagnóstico de tráfego, não uma interpretação do estado do jogo.

O selo SIMULAÇÃO e as métricas fictícias continuam separados do UDP. A validação de recepção com o F1 25 foi relatada para ambos os formatos; o parser de dados de corrida permanece fora da V0.2A e depende de uma próxima entrega explicitamente autorizada.
