# Validação V0.3A — monitoramento real de pneus

Implementação e retomada em **15/11/2026**, na branch `feat/v0.3a-tyre-monitoring`. Validação manual com F1 25 real aprovada conforme relato do usuário nos sete cenários abaixo. Commit e push exclusivamente desta branch autorizados; **revisão técnica independente pendente antes do merge**. Merge na main não autorizado.

## Preparação e retomada

- O GitHub confirmou o [PR #6](https://github.com/andre-rossi-dev/rossi-pitwall/pull/6) integrado à `main`, commit `054328db61d632b3ee4f55a4abc9a031061862ae`. O fetch concluiu e `main...origin/main` retornou `0 0`, com árvore limpa, antes da criação da branch desta entrega.
- Fetch e criação da branch inicialmente encontraram bloqueio de gravação em `.git`; concluíram após autorização de execução. Não houve falha de produto nem comando destrutivo.
- Na retomada, foram confirmados a branch solicitada, seis arquivos rastreados modificados e seis novos. Todas as alterações foram preservadas, sem recriar a branch ou sincronizar sobre a árvore modificada.
- AGENTS.md, implementação, contratos, receptor, IPC, interface, fixtures, testes e documentação foram revisados. Não foi identificada necessidade de corrigir o código de produto na retomada. O trabalho restante concentrou-se em complementar o smoke, inspecionar o painel e documentar a entrega.

## Escopo e decisões arquiteturais

`decodeTyres` interpreta somente composto real, composto visual, idade e desgaste do carro selecionado por `playerCarIndex`. O Main mantém dois grupos adicionais, `tyreStatus` e `tyreWear`, no snapshot real existente. Eles atravessam o mesmo IPC restrito, com o mesmo socket UDP e sem nova API de rede. Receptor, Main de integração, Preload, CSP, configuração de segurança, simulador e dependências permaneceram inalterados.

O painel **PNEUS — DADOS REAIS** aparece somente em UDP REAL. Mostra compostos separados, idade em voltas, FE/FD/TE/TD e disponibilidade independente de composto/idade e desgaste. Ausentes/vencidos aparecem como `—`; códigos desconhecidos mantêm seu número. Percentuais usam até uma casa decimal, sem alterar o valor guardado no snapshot. O estado geral anterior continua descrevendo velocidade/marcha/volta; pneus não o bloqueiam. Não há novas leituras de temperatura/pressão, inventário, histórico de stints, prognósticos ou estratégias.

## Campos, layouts e fundamentação

Os dois TXT e PDFs oficiais da EA foram consultados na execução inicial desta tarefa. As referências, derivação packed e páginas estão em [Pneus no protocolo](udp-protocol.md#pneus--v03a). Identificação exclusivamente por `packetFormat`, cabeçalho de 29 bytes, **packetVersion 1** para IDs 7 e 10, números multibyte little-endian.

| Protocolo | Carros/índices válidos | ID 7: stride / total | ID 10: stride / total |
| --- | --- | --- | --- |
| 2025 | 22 / 0–21 | 55 / 1239 bytes | 46 / 1041 bytes |
| 2026 | 24 / 0–23 | 59 / 1445 bytes | 46 / 1133 bytes |

Base do jogador `B = 29 + playerCarIndex × stride`. Os offsets selecionados coincidem após conferência separada; o tamanho dos pacotes e o stride do ID 7 diferem. Em 2026, esse ID acrescenta um float de limite ERS por volta, fora do escopo interpretado. O ID 10 mantém a estrutura por carro, mas contém 24 carros em vez de 22. Ambos não têm trailer.

| Campo | Pacote | Tipo | Offset relativo ao carro | Offset absoluto |
| --- | --- | --- | --- | --- |
| m_actualTyreCompound | ID 7 | uint8 | 25 | B + 25 |
| m_visualTyreCompound | ID 7 | uint8 | 26 | B + 26 |
| m_tyresAgeLaps | ID 7 | uint8 | 27 | B + 27 |
| m_tyresWear[0..3] | ID 10 | float32 LE × 4 | 0, 4, 8, 12 | B + 0/4/8/12 |

Metadados de cabeçalho usados: formato uint16 em 0; versão uint8 em 5; ID uint8 em 6; UID uint64 em 7; tempo float32 em 15; frame uint32 em 19; overallFrame uint32 em 23; índice uint8 em 27. UID é convertido de BigInt diretamente para string decimal, sem perda de precisão.

Ordem oficial de transmissão **TE, TD, FE, FD** (RL, RR, FL, FR). O contrato nomeia `rearLeft`, `rearRight`, `frontLeft`, `frontRight`; a interface reordena para **FE, FD, TE, TD**. A fixture padrão envia 11,25%, 22,5%, 33,75%, 44%, respectivamente, com danos e outros carros distintos para detectar inversões ou leitura do campo errado.

Compostos físicos reconhecidos: 16=C5, 17=C4, 18=C3, 19=C2, 20=C1, 21=C0, 22=C6, 7=intermediário e 8=chuva. Visuais: 16=macio, 17=médio, 18=duro, 7=intermediário e 8=chuva. Não se converte C3 automaticamente em médio. Os números originais permanecem no snapshot; códigos fora da tabela moderna aparecem como `Desconhecido (código)`, inclusive categorias fora do escopo.

O parser rejeita versão/formato/ID incompatíveis, tamanho diferente do exato, índice inválido e tempo não finito antes de ler os campos. Qualquer roda com NaN, infinito ou desgaste fora de [0, 100] rejeita todo o grupo daquele datagrama. Isso não renova frescor nem substitui a última amostra aceita, que pode permanecer visível até seu vencimento original. Não há saturação artificial nem preenchimento de valores. Desgaste zero/100/fração e idade zero são válidos; idade preserva todo uint8. Desgaste é percentual direto do jogo, distinto de integridade, dano ou aderência.

## Frescor e integridade temporal

- Cada grupo expira em **3000 ms** pelo relógio monotônico local. Publicação coalescida a até **10 Hz**, com transições de expiração mesmo sem tráfego. `getSnapshot()` verifica validade imediatamente.
- Cada ID guarda sua própria referência `overallFrameId`. A distância modular `(novo - anterior) >>> 0` só é aceita entre 1 e 2³¹−1. Duplicatas, atrasos e meia faixa ambígua não renovam validade. O operador `>>> 0` converte a diferença para uint32, permitindo wraparound.
- Não há comparação entre IDs nem exigência de frames iguais. Idade/desgaste, tempo e frame comum podem retroceder quando o contador geral avança, inclusive em flashbacks e trocas de pneus.
- Nova identidade `(sessionUID, packetFormat, playerCarIndex)` exige a confirmação existente: avanço no mesmo grupo dentro de 1000 ms. IDs 7/10 também podem confirmar. Os cinco grupos são limpos antes da aplicação da candidata, preservando os instantes originais de recepção. A fila limitada dos oito UIDs substituídos permanece aplicada a todos os grupos.
- Contexto ausente/contraditório não impede pneus nem indicadores anteriores. Silêncio, pausa e expiração não apagam identidade/referências nem identificam pausa automaticamente. Reinício, erro ou parada do receptor limpam os grupos. Encerrar a fonte cancela inscrições e timer.

## Verificações efetivamente executadas

Resultados da implementação e retomada, anteriores ao relato manual, salvo indicação explícita. Não são novas execuções durante a revisão documental para publicação. Todos os dados enviados nos testes automatizados são **fixtures sintéticas**, inclusive com sockets locais e Electron real. Não houve execução do F1 25 pelo agente.

| Etapa | Resultado observado |
| --- | --- |
| Execução inicial: parser novo + fonte existente | 93 testes aprovados em 2 arquivos |
| Execução inicial: parser/fonte de pneus + receptor | 70 testes aprovados em 3 arquivos, após refinamento dos casos |
| Execução inicial: suíte completa, typecheck e build | 234 testes em 9 arquivos; checagem e build aprovados |
| Execução inicial: smoke `receive` e `occupied` | Ambos aprovados; capturas iniciais não mostravam todo o painel de pneus |
| Retomada: `npm run typecheck` | Aprovado, código 0 |
| Retomada: `npm run test` | **234 testes em 9 arquivos aprovados**, código 0 |
| Retomada: `npm run build` | Aprovado, código 0; Main, Preload CommonJS e Renderer compilados |
| Retomada: `node --check scripts/smoke.cjs` | Aprovado, código 0 |
| Retomada: smoke `receive` ampliado | `SMOKE OK (receive)`, código 0, quatro capturas incluindo painel após rolagem |
| Retomada: smoke `occupied` | `SMOKE OK (occupied)`, código 0 |
| Retomada: smoke `invalid` | `SMOKE OK (invalid)`, código 0 |
| Diff e arquivos novos | Revisão completa e verificações de whitespace concluídas sem erros |
| F1 25 real / revisão técnica independente | Pendentes na conclusão inicial; relato manual posterior registrado abaixo. Revisão independente continua pendente |
| Smoke no servidor de desenvolvimento | Não executado; integração gráfica usou o build de produção |

Os 61 casos acrescentados à suíte anterior dividem-se em 25 do parser/rótulos, 34 do ciclo dos pneus e 2 do receptor com sockets locais. Cobrem protocolos, jogador não zero e último índice, campos distintos, desconhecidos, zeros/limites/frações, todas as truncagens, valores inválidos por roda, frames atrasados/duplicados/ambíguos/wraparound, flashback, troca de pneus, expiração independente, identidade, formato/carro, pausa/silêncio/retomada, contexto ausente/conflitante e cleanup. A suíte existente permanece cobrindo velocidade/marcha/volta, contexto, simulador e ponte restrita.

O smoke ampliado verifica os valores e rótulos no DOM após percorrer UDP → Main → IPC → Preload → React: formatos 2025/2026, quatro rodas, dados parciais/ausentes/vencidos, desconhecidos, redução por flashback e por troca de pneus, identidade, recarga, expiração independente e retomada. Preserva verificações anteriores de R/N, volta, contexto, cancelamento de inscrição IPC, API pública restrita, ausência de Node no Renderer e preferências de segurança Electron.

As capturas `tyres-initial.png` e `tyres-minimum.png`, em `.smoke-profile/` ignorado pelo Git, foram inspecionadas. O painel inteiro, percentuais e rótulos longos de desconhecidos permanecem legíveis nas janelas 980×660 e 640×500, sem excesso horizontal nem texto cortado. Há rolagem vertical, inclusive na janela inicial, pois o painel fica abaixo dos indicadores preservados. O smoke também verifica limites do painel e largura dos campos após rolagem.

### Problemas e correções na retomada

Não foi identificada falha funcional que exigisse alterar o código de produto. Foi identificada uma lacuna na evidência gráfica: as capturas do topo não incluíam o painel completo. O smoke recebeu capturas após rolagem e asserções de limites, além de cenários explícitos de troca de pneus e expiração independente. README e protocolo ainda descreviam a V0.2C-B; foram atualizados para o escopo implementado e este registro foi criado.

Não ocorreu `UnknownVizError` nas execuções desta V0.3A registradas acima. A intermitência histórica da [V0.2C-B](validation-v0.2c-b.md#falhas-gráficas-e-limitações-da-evidência) permanece sem causa/resolução definitiva comprovada. O smoke mantém diagnóstico de visibilidade, espera de frames e falha explícita, sem retry automático. Aprovação atual não comprova correção definitiva dessa intermitência.

## Validação manual com F1 25 real — relato do usuário

Relato recebido em **15/11/2026**. O usuário informou aprovação dos sete cenários, sem problemas relatados durante a validação. São observações do usuário, separadas das evidências sintéticas e automatizadas; o agente não executou o jogo nem realizou medições desses cenários.

| Cenário | Resultado relatado |
| --- | --- |
| Pneus na saída dos boxes | Compostos, idade e desgaste identificados corretamente |
| Evolução do desgaste | Valores acompanharam normalmente o uso dos pneus |
| Troca de pneus | Dados atualizados corretamente após a troca |
| Flashback | Comportamento correto, sem anomalias observadas |
| Pausa e interrupção UDP | Expiração e retomada funcionando |
| UDP 2026 | Funcionamento aprovado |
| Sessões, interface e simulador | Funcionamento aprovado |

O usuário também confirmou a distinção correta entre composto visual (macio, médio e duro) e físico (C3, C4 e C5, conforme observado). O relato não estabelece uma correspondência fixa entre essas duas classificações, nem valida todos os compostos ou modos do jogo.

A aprovação se limita aos cenários observados: não comprova funcionamento universal, ausência de perda de pacotes, latência ou sincronização perfeita entre grupos. Não foram fornecidas capturas binárias, sequências de contadores ou UIDs que permitam concluir sobre resets, reutilização de UID ou casos temporais ambíguos. Permanecem a independência temporal dos grupos UDP, a ausência de histórico persistente de stints, a reconciliação incompleta de flashbacks, as limitações anteriores de identidade/UID e a intermitência histórica `UnknownVizError`, sem resolução definitiva comprovada. O roteiro adiante permanece para repetição e ampliação; o relato não implica execução de todos os seus passos técnicos.

## Revisão para commit e publicação da branch

Após o relato, o usuário autorizou o commit `feat: adiciona monitoramento real de pneus via UDP` e o push exclusivamente de `feat/v0.3a-tyre-monitoring`. A revisão técnica independente ocorrerá após essa publicação e antes de qualquer autorização de merge na main.

Nesta etapa, somente este documento e o README foram atualizados para registrar o relato e corrigir o estado da validação. Código, fixtures, testes e smoke permaneceram como na implementação verificada. Suíte completa, typecheck, build e smokes não foram repetidos; os resultados acima são das execuções anteriores.

A revisão para publicação abrangeu os 15 arquivos da entrega, incluindo os sete novos, sem identificar problema técnico relevante ou alteração fora do escopo. A inspeção e a busca por padrões comuns de credenciais não identificaram segredos. Dependências, build e perfil/capturas locais permanecem ignorados e fora da seleção; `package.json` e `package-lock.json` não foram alterados. O diff e os arquivos novos passaram na conferência de whitespace. Em comparações dos novos contra arquivo vazio, código 1 pode indicar diferenças esperadas; os avisos de normalização LF → CRLF não são erros de whitespace.

O interesse do usuário em ícones visuais para os compostos fica registrado como sugestão de refinamento futuro, fora do escopo desta entrega. Nenhum ícone ou funcionalidade da V0.3B foi implementado.

## Limitações conhecidas

- Validação manual dos sete cenários aprovada conforme relato acima, sem comprovar todos os modos, compostos ou casos temporais; revisão técnica independente pendente.
- Grupos independentes podem representar instantes diferentes durante uma troca de pneus ou flashback. Não há sincronização, histórico de stints nem reconciliação completa.
- Mantidas as limitações anteriores: UID reutilizado ainda retido fica bloqueado; resets/saltos ambíguos de contador não têm recuperação automática; contexto contraditório permanece indisponível até troca confirmada/reinício.
- Dados inválidos não têm contador específico de payload; diagnóstico de cabeçalho reconhecido não valida o conteúdo completo nem autentica o remetente.
- Apenas jogador primário, campos selecionados e compostos modernos conhecidos. Nenhuma inferência estratégica, suporte histórico específico, serviço externo ou nova dependência.

## Roteiro de validação manual com F1 25

1. Execute `npm run build` e `npm start`. Configure UDP local para `127.0.0.1:20777`, broadcast desligado e inicialmente 20 Hz, conforme README. Comece em formato 2025 e repita em 2026. Sem transmissão, pneus e indicadores devem mostrar `—`, aguardando dados.
2. Em pista, compare o composto **visual**, idade e desgaste de cada roda com o MFD/HUD. Identifique FE/FD/TE/TD separadamente e aceite diferenças de arredondamento/exibição. Confira também velocidade, R/N/marchas e volta. Para o composto físico C0–C6, registre o código via snapshot quando necessário; a cor do HUD não comprova essa designação.
3. Percorra voltas e faça uma troca de pneus nos boxes. Observe a mudança dos compostos, idade e redução do desgaste conforme o jogo, sem presumir que todo jogo montado seja novo ou tenha desgaste exatamente zero. Não devem surgir alertas ou recomendações.
4. Faça flashbacks para momentos de menor idade/desgaste, inclusive atravessando uma troca de pneus. Verifique recuperação dos grupos conforme chegam novas amostras e registre divergências persistentes.
5. Pause/retome e use Alt+Tab. Desative explicitamente o UDP por mais de três segundos: os grupos devem vencer e mostrar `—`. Reative e confira retomada. Pausa pode manter tráfego; não equivale necessariamente a silêncio nem avanço de contador. Expiração seletiva entre IDs é coberta pelos testes sintéticos, sem controle seletivo de pacotes no produto.
6. Troque de sessão, fim de semana e retome save. Alterne 2025 → 2026 → 2025. Após confirmação da identidade, valores antigos não devem reaparecer combinados com a nova transmissão. Registre bloqueios antes de reiniciar; não deduza reutilização de UID somente pela interface.
7. Alterne SIMULAÇÃO/UDP REAL: não há painel de pneus na simulação. Recarregue com `Ctrl+R`, confira que o estado Main/socket persiste e teste as janelas 980×660 e 640×500 com rolagem. Feche/reabra e confira liberação da porta.
8. Registre data, build do jogo, formato observado, circuito, modo, taxa UDP, jogador, sequência de ações e resultado por campo/roda. Separe observação, snapshot e hipótese. A aprovação manual foi relatada; a revisão independente permanece necessária antes de qualquer autorização de merge.

Inspeção opcional durante desenvolvimento, via DevTools e API existente:

```javascript
const cancelar = window.pitwall.onRealTelemetry((estado) => {
  console.log(estado.identity, estado.identityRevision,
    estado.tyreStatusFreshness, estado.tyreStatus,
    estado.tyreWearFreshness, estado.tyreWear)
  cancelar()
})
```

O snapshot chega por IPC assíncrono. A inscrição é cancelada após a primeira resposta. Grupos vencidos são `null`; não é possível inferir deles o payload bruto rejeitado.

## Arquivos da entrega

Revisão final da implementação, antes da seleção para commit: **oito arquivos rastreados modificados e sete novos**, sem alterações no staging naquele momento. `git diff --check` e conferência dos novos com `git diff --no-index --check` não apontaram whitespace inválido; os avisos LF → CRLF indicam apenas normalização futura pelo Git. Após as verificações finais de código e integração, as alterações restantes foram exclusivamente documentais, sem necessidade de repetir suíte e build.

| Arquivo | Alteração |
| --- | --- |
| `src/main/udp/decodeTyres.ts` (novo) | Parser defensivo IDs 7/10, formatos 2025/2026 |
| `src/shared/tyres.ts` (novo) | Contratos e rótulos separados de compostos |
| `src/shared/realTelemetry.ts` | Dois grupos e frescor no snapshot |
| `src/main/telemetry/RealTelemetrySource.ts` | Integração, ordem, identidade e ciclo de vida |
| `src/renderer/src/TyrePanel.tsx` (novo) | Painel compacto de observação |
| `src/renderer/src/App.tsx` | Integração somente em UDP REAL e identificação V0.3A |
| `src/renderer/src/styles.css` | Estilos limitados ao painel |
| `tests/fixtures/f1-tyres.ts` (novo) | Fixtures independentes e completas |
| `tests/tyre-parser.test.ts` (novo) | Layouts, campos, limites e rótulos |
| `tests/tyre-source.test.ts` (novo) | Integridade temporal, identidades e recursos |
| `tests/udp-receiver.test.ts` | Pneus pelo mesmo socket local |
| `scripts/smoke.cjs` | Integração e capturas do painel |
| `README.md` | Escopo, funcionamento, limites e validação |
| `docs/udp-protocol.md` | Fundamentação, offsets e políticas |
| `docs/validation-v0.3a.md` (novo) | Este registro |

AGENTS.md permaneceu inalterado: não houve nova regra arquitetural permanente. Build, capturas e perfil gráfico continuam ignorados. Mensagem de commit autorizada: `feat: adiciona monitoramento real de pneus via UDP`.
