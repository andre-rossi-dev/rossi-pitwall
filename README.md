# ROSSI Pitwall — V0.3A

Fundação de um aplicativo desktop para Windows que futuramente atuará como engenheiro de corrida local para o **EA SPORTS F1 25**, com temporada **2026** por pacote visual e física padrão do jogo.

**UDP REAL** decodifica velocidade, marcha e volta do jogador nos formatos 2025 e 2026. **SIMULAÇÃO** mantém o simulador local com valores explicitamente fictícios, sem abrir o jogo. O modo selecionado permanece visível; dados reais ausentes ou vencidos aparecem como **—**, sem preenchimento pelo simulador. A primeira comparação visual com o HUD do F1 25 foi relatada pelo usuário nos dois formatos; observações e limites estão em [Validação V0.2B](docs/validation-v0.2b.md).

## Escopo implementado

- Janela Electron convencional, redimensionável, com interface React em português brasileiro.
- Estado da fonte, velocidade (km/h), marcha e volta, recebidos por IPC.
- Simulador determinístico no Main: primeira amostra imediata, atualizações a cada 250 ms, volta fictícia de 60 segundos.
- Inicialização e parada idempotentes, inscrições canceláveis e encerramento dos recursos com a janela.
- Receptor UDP independente do React, usando `node:dgram` no Main, em `127.0.0.1:20777` por padrão.
- Porta configurável, estados de recepção, contadores de pacotes/bytes e tratamento de porta ocupada sem interromper o simulador.
- Inspeção dos cabeçalhos 2025/2026 conforme a EA; formatos desconhecidos são informados sem interpretar o layout.
- Parser de Car Telemetry (ID 6: velocidade/marcha) e Lap Data (ID 2: volta), com seleção de `playerCarIndex`, sessão uint64 preservada e expiração independente dos dois grupos.
- Integridade temporal por grupo usando `overallFrameIdentifier`, preservação de flashbacks, confirmação de identidade e proteção limitada em memória contra sessões substituídas.
- Contexto mínimo de Session Data (ID 1) em 2025/2026: tipo de sessão, circuito e vínculos lógicos de temporada/fim de semana/sessão, separados do UID técnico. Indicação discreta na interface, com desconhecidos explícitos e expiração independente.
- Monitoramento dos pneus do jogador em 2025/2026: composto real, composto visual e idade (ID 7), além do percentual de desgaste por roda (ID 10). Painel **PNEUS — DADOS REAIS**, com frescor independente dos dois grupos, sem previsões ou estratégias. Validação manual dos sete cenários aprovada conforme relato do usuário; revisão técnica independente pendente.
- Testes automatizados com Vitest, UDP local e roteiro de integração com Electron real.

## Stack e pré-requisitos

Windows 10/11 de 64 bits, **Node.js 24 LTS (24.14.0 ou superior na linha 24)** e npm. Git é necessário para obter o repositório. O ambiente inicial foi verificado com npm 10.8.2 e Git 2.53.0.windows.2.

| Dependência | Versão fixada |
| --- | --- |
| Electron | 45.3.2 |
| React / React DOM | 19.3.1 |
| TypeScript | 7.0.2 |
| electron-vite | 6.0.0 |
| Vite | 8.3.8 |
| Vitest | 5.1.0 |
| Plugin React para Vite | 6.3.0 |
| @types/node | 24.19.2 |
| @types/react / @types/react-dom | 19.3.0 |

As versões diretas estão fixadas em `package.json`; `package-lock.json` registra a resolução completa. Não é necessário instalar Electron ou TypeScript globalmente.

## Instalação e execução

Na pasta do clone local:

```powershell
npm ci
npm run dev
```

A primeira instalação/execução precisa de internet para obter os pacotes e o binário do Electron. Depois disso, a aplicação não depende de serviços externos. Em desenvolvimento, o Vite atende somente em `127.0.0.1`.

`npm run dev` abre a janela e habilita atualização da interface durante a edição. Feche a janela para encerrar o aplicativo. Mudanças em Main/Preload exigem reiniciar o comando, ou executar `npm run dev -- --watch`.

Se um terminal herdou `ELECTRON_RUN_AS_NODE=1` de outra ferramenta, o Electron pode iniciar como Node e acusar que `app` está indefinido. Limpe a variável **somente na sessão atual do PowerShell** antes de executar os comandos gráficos:

```powershell
$env:ELECTRON_RUN_AS_NODE = $null
npm run dev
```

## Verificações e compilação

```powershell
npm run typecheck
npm run test
npm run build
npm start
```

- `typecheck`: verifica separadamente o código Node/Electron e o código de navegador, com TypeScript estrito.
- `test`: executa os testes uma vez, com saída apropriada para automação. Não precisa do jogo nem abre janelas.
- `build`: verifica tipos e compila Main, Preload e Renderer em `out/`.
- `start`: abre a versão de produção usando electron-vite preview. Não gera um instalador.

Teste opcional de integração após o build:

```powershell
npm run test:smoke
```

Ele abre uma janela Electron real e verifica isolamento, API restrita, modos real/simulado, diagnóstico, **pacotes sintéticos completos 2025/2026**, R/N, dados parciais, mudança de sessão/formato, expiração, retomada, recarga e largura mínima. Fecha a janela automaticamente e retorna código zero em caso de sucesso. Usa uma porta local efêmera, sem depender da porta do jogo. O perfil e as imagens de verificação ficam em `.smoke-profile/`, ignorado pelo Git. Precisa de uma sessão gráfica do Windows; não substitui o teste com o jogo.

Há também cenários de porta ocupada e configuração inválida:

```powershell
$env:ROSSI_SMOKE_UDP_MODE = 'occupied'
npm run test:smoke
$env:ROSSI_SMOKE_UDP_MODE = 'invalid'
npm run test:smoke
$env:ROSSI_SMOKE_UDP_MODE = $null
```

Os resultados desta entrega estão em [Validação V0.3A](docs/validation-v0.3a.md). O histórico permanece em [Validação V0.2C-B](docs/validation-v0.2c-b.md), [Validação V0.2C-A](docs/validation-v0.2c-a.md), [Validação V0.2B](docs/validation-v0.2b.md) e [Validação V0.2A](docs/validation-v0.2a.md).

Para verificar também o caminho de desenvolvimento, com o mesmo teste:

```powershell
npm run dev -- --entry scripts/smoke.cjs
```

## Arquitetura

```text
src/
  main/
    index.ts                         Janela, segurança, IPC e ciclo de vida
    udp/
      config.ts                      Endereço fixo e validação da porta
      inspectHeader.ts               Inspeção defensiva do cabeçalho EA
      decodeTelemetry.ts             Parser dos payloads IDs 2/6 por formato
      decodeSession.ts               Contexto mínimo do ID 1 por formato
      decodeTyres.ts                 Composto/idade (ID 7) e desgaste (ID 10)
      UdpReceiver.ts                 Socket, contadores e diagnóstico
    telemetry/
      SimulatedTelemetrySource.ts    Geração determinística no Main
      RealTelemetrySource.ts         Sessão, estado parcial e frescor no Main
  preload/
    index.ts                         Ponte restrita window.pitwall
  renderer/
    index.html                       Documento e política de conteúdo
    src/
      App.tsx                        Interface e inscrição com cleanup
      UdpDiagnostics.tsx             Diagnóstico independente do modo selecionado
      TyrePanel.tsx                  Painel compacto de pneus, somente UDP REAL
      main.tsx                       Entrada React com StrictMode
      env.d.ts                       Tipagem da API exposta
      styles.css                     Identidade visual e layout responsivo
  shared/
    telemetry.ts                     Amostra, estado e contrato da fonte
    realTelemetry.ts                 Estado UDP parcial e validade por grupo
    sessionContext.ts                Tipo/circuito, vínculos e estados do contexto
    tyres.ts                         Contratos e rótulos de compostos modernos
    ipc.ts                           Canal e API pública
    udp.ts                           Contrato de diagnóstico (sem TelemetrySample)
tests/
  simulated-telemetry.test.ts
  preload.test.ts
  udp-header.test.ts
  udp-receiver.test.ts
  real-telemetry-parser.test.ts
  real-telemetry-source.test.ts
  session-parser.test.ts
  tyre-parser.test.ts
  tyre-source.test.ts
  fixtures/f1-header.ts               Cabeçalho sintético documentado
  fixtures/f1-telemetry.ts            Payloads completos sintéticos
  fixtures/f1-session.ts              Session Data sintético 2025/2026
  fixtures/f1-tyres.ts                Car Status/Car Damage sintéticos 2025/2026
scripts/
  smoke.cjs                          Integração com Electron real
```

Fluxo: **SimulatedTelemetrySource → Main → canal `pitwall:telemetry` → Preload → React**.

Fluxo adicional: **UDP local → UdpReceiver → Main → canal `pitwall:udp-diagnostics` → Preload → painel de diagnóstico**. O UDP não alimenta as métricas simuladas.

Fluxo real: **mesmo UdpReceiver → decodeTelemetry/decodeSession/decodeTyres → RealTelemetrySource → canal `pitwall:real-telemetry` → Preload → React**. Nenhum datagrama bruto atravessa IPC. A camada real publica estados a até 10 Hz; cada grupo vence após 3 segundos sem amostra aceita como nova. Duplicações e atrasos não renovam frescor. Confirmar a troca de sessão, formato ou índice do jogador limpa os dados anteriores. O detalhamento de offsets e políticas está em [Protocolo UDP](docs/udp-protocol.md).

Os pneus usam dois grupos independentes (`tyreStatus` e `tyreWear`), sem exigir frames iguais. A interface mostra FE/FD/TE/TD, desgaste em percentual com até uma casa decimal e idade em voltas, inclusive zero. Composto real C3 não implica composto visual médio: ambos são lidos separadamente. Códigos fora da tabela moderna aparecem como `Desconhecido (código)`. Um desgaste não finito ou fora de 0–100% rejeita todo o grupo daquele pacote, sem renovar sua validade; a última amostra aceita permanece visível somente até vencer. Dados ausentes/vencidos são `—`. O painel não aparece em SIMULAÇÃO. Seu estado de disponibilidade é independente do estado dos indicadores anteriores; não há interpretação estratégica do desgaste.

O contexto usa a identidade técnica `(sessionUID, packetFormat, playerCarIndex)` e mantém separados os vínculos `seasonLinkIdentifier`, `weekendLinkIdentifier` e `sessionLinkIdentifier`. Vínculos zero e códigos desconhecidos viram `null`. O ID 1 pode estar ausente sem interromper velocidade, marcha ou volta. Na interface, contexto fresco mostra tipo/circuito reconhecidos; contexto ausente aguarda dados, e contexto vencido ou contraditório aparece como indisponível. O estado da fonte continua descrevendo as métricas, independentemente do contexto.

Mudança de UID não significa automaticamente mudança de fim de semana. Retomada com UID novo exige a confirmação existente e limpa as métricas anteriores, mesmo que os vínculos sejam iguais. A proteção dos oito UIDs substituídos permanece: os vínculos persistentes também podem estar em pacotes antigos e não comprovam uma retomada de UID bloqueado. Contexto contraditório sob a mesma identidade técnica fica indisponível até troca confirmada ou reinício; as métricas continuam sem associação lógica. Não há persistência nem agrupamento histórico de sessões.

O Main é dono da fonte e do timer. A janela inicia a fonte quando a página termina de carregar. Recarregar a página não cria outro timer nem reinicia a sequência. Ao fechar a janela ou sair do aplicativo, o Main cancela sua inscrição e para a fonte.

O Preload oferece apenas `window.pitwall.onTelemetry(callback)`, `onUdpDiagnostics(callback)` e `onRealTelemetry(callback)`, todas com cancelamento individual. O evento interno do Electron não chega ao React. O `useEffect` usa o cancelamento como cleanup, inclusive no ciclo adicional do StrictMode. Para diagnóstico e telemetria real, o Preload instala o listener antes de solicitar o snapshot atual pelos respectivos canais internos de request, sem argumentos, evitando perda do estado inicial.

Os pedidos do Renderer ao Main leem diagnóstico ou telemetria real atuais; o Main verifica a janela e o frame remetentes. Não há comandos de rede nem configuração expostos ao React. `contextIsolation` e `sandbox` estão habilitados; `nodeIntegration` e `webviewTag`, desabilitados. Novas janelas, navegações iniciadas pela página e permissões são bloqueadas. O preload é um único bundle CommonJS compatível com sandbox. A política de conteúdo permite o preâmbulo inline do React Refresh somente no desenvolvimento; scripts inline são bloqueados no build de produção.

### Contrato da fonte

`TelemetrySource` define `start`, `stop`, `getSnapshot` e `subscribe`. A inscrição entrega o estado atual imediatamente. `stop` notifica o estado `stopped`, cancela o timer e mantém a última amostra; depois de retornar, não emite mais eventos. As inscrições permanecem até o consumidor cancelá-las, permitindo reiniciar a fonte com os mesmos consumidores. O Main sempre cancela a sua no encerramento.

O simulador reinicia a sequência ao chamar `start` após `stop`. Usa o identificador fixo `simulation-v0.1`, sem aleatoriedade nem dependência do relógio real. Ele não reproduz a física do F1 25; velocidades, marchas e duração das voltas são apenas demonstrativas.

Os metadados simulados incluem origem, sessão, frame, tempo da sessão e versão do protocolo. `protocolVersion: null` continua correto para o simulador. A fonte real usa `RealTelemetrySnapshot`, separado do contrato de amostra completa do simulador, pois os grupos podem estar ausentes ou vencer independentemente. `sessionId` real é uma string decimal que preserva todos os bits do uint64.

**Tempo, frame e volta não são contratos de ordem crescente.** A interface aceita cada amostra simulada recebida, e o receptor não descarta cabeçalhos por retrocesso de tempo/frame. Não há detecção nem reconciliação de flashbacks. O pacote visual 2026 não determina a versão UDP: a identificação usa exclusivamente `packetFormat` nos bytes recebidos.

### Ciclo de vida do receptor

`start` e `stop` são assíncronos, idempotentes e serializados, inclusive durante o bind. `stop` aguarda o fechamento do socket, remove os listeners internos e cancela o timer. As inscrições de consumidores duram até o cancelamento explícito, como no simulador. O Main cancela suas inscrições ao fechar a janela e aguarda o fechamento antes de sair.

Os contadores incluem **todos** os datagramas entregues ao receptor, inclusive vazios, curtos e não suportados. Cabeçalhos 2025/2026 reconhecidos, inválidos e não suportados têm contadores separados. `getSnapshot` reflete cada recepção imediatamente; notificações de tráfego são agrupadas a cada 250 ms, sem logs por pacote. Transições de abertura/erro/parada e pedidos de snapshot são imediatos. A memória usada pelo diagnóstico é limitada: guarda contadores e a última inspeção, sem armazenar datagramas.

Após 3 segundos sem datagramas, o diagnóstico informa ausência de tráfego recente. Isso não determina se o jogo está pausado, desconectado ou em um menu. Um novo datagrama retoma a indicação de recepção. Os contadores permanecem ao parar e zeram ao iniciar uma nova execução; recarregar a página não reinicia o receptor. Após erro, libere/configure a porta e reinicie o aplicativo.

## Configurar UDP no F1 25

Use o jogo e o ROSSI Pitwall **no mesmo computador**; esta entrega escuta apenas IPv4 local (`127.0.0.1`). Nas opções/configurações do jogo, abra a seção de telemetria/UDP e ajuste:

| Opção | Valor inicial |
| --- | --- |
| Telemetria UDP | Ativada |
| Modo broadcast / transmissão | Desativado |
| Endereço IP UDP | `127.0.0.1` |
| Porta UDP | `20777` |
| Taxa de envio | `20 Hz` para a primeira validação |
| Formato UDP | `2025`; se a instalação oferecer `2026`, pode ser validado separadamente |

Os nomes podem variar com o idioma e a versão do jogo. A EA documenta a configuração no menu e a seleção do formato; veja as [referências oficiais](docs/udp-protocol.md). Não é necessário editar arquivos nem instalar addons no jogo. Uma pintura/temporada visual não confirma qual formato está sendo enviado.

Para usar outra porta, feche o aplicativo e configure a variável **no terminal que irá iniciá-lo**:

```powershell
$env:ROSSI_UDP_PORT = '20778'
npm run dev
# Ou, após o build: npm start
```

Configure a mesma porta no jogo. A variável aceita inteiros de 1 a 65535; valores inválidos deixam o receptor em erro, mantendo o simulador funcionando. Arquivos `.env` não são carregados automaticamente pelo Main. Para retornar ao padrão:

```powershell
$env:ROSSI_UDP_PORT = $null
```

Se aparecer `EADDRINUSE`, outra instância ou aplicativo já usa a porta. Feche o processo que a utiliza ou escolha outra porta em ambos os programas e reinicie o Pitwall. Não há envio UDP, broadcast, encaminhamento nem alteração automática no jogo.

## Testes

Os testes unitários cobrem validade das amostras em duas voltas completas, origem simulada, metadados, periodicidade, início/parada, ausência de timers duplicados, múltiplos consumidores, cancelamentos independentes, ausência de emissões após parada, reinício e previsibilidade entre instâncias. Usam timers falsos, sem depender do F1 25.

Os testes da ponte verificam API restrita, canal específico, remoção dos eventos privilegiados, cancelamento individual e ausência de listeners acumulados no ciclo de montagem do React. O smoke test complementa esses testes verificando o fluxo real, sem substituir a validação visual humana.

Os testes UDP usam sockets locais reais com portas efêmeras e **buffers sintéticos identificados como fixtures**, fundamentados no cabeçalho oficial. Cobrem abertura/parada/reinício, concorrência de ciclo de vida, contadores, formatos/IDs, limites de leitura, datagramas inválidos, retrocesso de tempo/frame, porta ocupada, erro após bind, configuração inválida, silêncio/retomada, agrupamento das notificações, cancelamento de inscrições e liberação de sockets/listeners/timers. Não há capturas de telemetria real no repositório.

## Validação manual no Windows

1. Execute `npm run dev` sem abrir o F1 25. O modo inicial é UDP REAL: confirme **Aguardando dados** e três valores **—**.
2. Selecione SIMULAÇÃO e confirme o nome ROSSI PITWALL, o selo SIMULAÇÃO e o estado Fonte ativa.
3. Observe velocidade e marcha mudando; após 60 segundos, a volta avança para 2.
4. Redimensione a janela, inclusive até o tamanho mínimo, e verifique legibilidade e ausência de cortes.
5. Feche a janela e confira que o processo termina. Execute novamente e confirme que a simulação recomeça.
6. Execute `npm run build` e `npm start` para repetir a validação com a interface compilada.

### Validação V0.2A com o jogo

A recepção nos formatos UDP 2025 e 2026 foi validada manualmente pelo usuário, com resultados relatados em 14/11/2026 e registrados em [Validação V0.2A](docs/validation-v0.2a.md). O relato não comprova ausência de perda de pacotes nem interpretação de dados de pilotagem. O roteiro abaixo permanece disponível para repetir a validação.

1. Sem abrir o jogo, confirme **Aguardando datagramas**, endereço/porta corretos e contadores zerados; o simulador deve continuar ativo.
2. Configure o jogo como acima e entre em uma sessão na pista. Confirme que pacotes e bytes aumentam e que o último datagrama mostra formato e ID reconhecidos.
3. Registre o formato **observado**, a versão do jogo, a configuração UDP, os contadores de inválidos/não suportados e o ID exibido. Não use a pintura como evidência do protocolo.
4. Se disponível, alterne explicitamente entre 2025 e 2026 no menu UDP e confirme os contadores separados. Um formato fora do escopo deve aparecer como não suportado, sem interpretar seu ID.
5. Desative o UDP no menu do jogo. Após aproximadamente 3 segundos, confira **Sem datagramas** e contadores estáveis. Reative e confirme a retomada. Pausar o jogo pode manter envios e não é um teste confiável de silêncio.
6. Recarregue a página (`Ctrl+R`): os contadores não devem zerar e a simulação deve continuar. Verifique legibilidade em 980×660 e 640×500; a janela menor pode exigir rolagem vertical.
7. Feche o Pitwall e abra novamente: a porta deve ser liberada e os contadores reiniciados. Para testar conflito, abra uma segunda instância na mesma porta: ela deve mostrar `EADDRINUSE` e continuar simulando.

Esse histórico valida apenas a recepção da V0.2A. Na V0.2B, os indicadores dependem do modo selecionado. Cabeçalho reconhecido não valida o payload nem autentica que o remetente é o jogo.

### Validação V0.2B com o jogo

Em relato recebido em 14/11/2026, o usuário observou velocidade, marchas R/N/1–8 e volta acompanhando o jogo, expiração após aproximadamente 3 segundos de interrupção, retomada e aceitação de retrocessos em flashbacks repetidos, inclusive para uma volta anterior. Os formatos 2025 e 2026 funcionaram nos testes manuais, com o jogo em janela 1280×720 ao lado do Pitwall. São observações visuais, sem medição de latência ou comprovação de ausência de perdas, sincronização perfeita ou reconciliação completa de flashbacks. Veja o [registro detalhado](docs/validation-v0.2b.md#primeira-validação-manual-com-o-f1-25-real).

O roteiro abaixo permanece como histórico da V0.2B; o relato não confirma a execução de todos os seus passos. A integração dessa versão à main foi confirmada na preparação da V0.2C-A. Para a política temporal atual, use também o roteiro seguinte.

1. Execute `npm run build` e `npm start`, selecione **UDP REAL** e configure o jogo como acima, inicialmente em UDP 2025.
2. Na pista, compare velocidade em km/h, marcha e volta com o HUD. Verifique parado (0 km/h), neutro (N), ré (R) e marchas 1–8 quando possível. A interface atualiza a até 10 Hz, sem sincronização exata de frames com o HUD.
3. Repita no formato UDP 2026 e confirme o formato observado no rodapé e no diagnóstico. Se possível, use uma sessão com índice de jogador diferente de zero; registre o índice exibido.
4. Desative a transmissão UDP: após 3 segundos mais até um ciclo de publicação (100 ms), os grupos vencidos devem virar **—** e o estado indicar **Dados desatualizados**. Reative e confira a recuperação. Silêncio não é identificado como pausa.
5. Troque de sessão/formato e confira que volta e velocidade antigas não aparecem combinadas com a nova identidade. Faça um flashback e confira a aceitação do retrocesso; a V0.2B não reconcilia pacotes atrasados.
6. Alterne para SIMULAÇÃO e volte para UDP REAL: valores fictícios nunca devem preencher o modo real. Recarregue a página: volta a UDP REAL, preservando o estado Main e os contadores. Teste 980×660 e 640×500; rolagem vertical é esperada na janela menor.
7. Feche/reabra o aplicativo, confirme liberação da porta e registre build do jogo, formato, taxa UDP, índice, valores comparados e divergências. Repita os cenários nos dois formatos antes de publicar a entrega.

### Validação V0.2C-A com o jogo

Em relato recebido em 14/11/2026, o usuário informou sucesso nos seis cenários: telemetria normal em UDP 2025/2026, flashbacks, pausa/Alt+Tab, mudança de sessão, troca de protocolo e retomada de save, sem travamentos, congelamentos ou anomalias observadas. São observações do usuário, não medições automatizadas nem prova de funcionamento universal; veja a [validação manual e seus limites](docs/validation-v0.2c-a.md#validação-manual-com-o-f1-25-real--relato-do-usuário). O roteiro abaixo permanece para repetição e ampliação da evidência. Execute `npm run build` e `npm start`, configure o UDP como acima e repita separadamente em 2025 e 2026:

1. Compare velocidade, R/N/1–8 e volta com o HUD, inclusive parado e cruzando a linha de chegada.
2. Faça flashbacks repetidos, inclusive atravessando a linha para uma volta anterior. Confirme que as métricas acompanham a retomada, sem restaurar a volta pré-flashback. Registre qualquer congelamento/divergência.
3. Pause, retome e use Alt+Tab. Depois desative explicitamente o UDP por mais de 3 segundos e reative. Confira expiração por grupo e recuperação sem reiniciar o Pitwall; silêncio não deve ser identificado como pausa. Se houver tráfego repetindo o mesmo contador, é esperado que as métricas vençam.
4. Troque de sessão e alterne 2025 → 2026 → 2025, sem reiniciar o aplicativo. Confira atualização da identidade após confirmação e ausência de valores misturados. A confirmação precisa de avanço no mesmo ID dentro de um segundo; não depende de IDs 2 e 6 sincronizados.
5. Recarregue o Renderer durante o fluxo e após interrupção: contadores e identidade Main devem persistir. Alterne SIMULAÇÃO/UDP REAL e feche/reabra para conferir cleanup e liberação da porta.
6. Se aplicável, retome um save e registre se o UID é reutilizado ou o contador geral reinicia. UIDs substituídos ainda retidos são bloqueados; resets do contador na mesma identidade não são automaticamente reclassificados como sessão nova.

Registre versão/build do jogo, formato observado, taxa UDP, índice do jogador, sequência de ações e resultados separadamente por formato. Reordenação, duplicação, wraparound e UIDs antigos são exercitados por fixtures determinísticas; o HUD sozinho não comprova esses cenários. Detalhes, limites e evidências em [Validação V0.2C-A](docs/validation-v0.2c-a.md).

### Validação V0.2C-B com o jogo

Em relato recebido em 15/11/2026, o usuário informou aprovação de TL1/TL2/TL3, Q1/Q2/Q3, corrida, flashbacks/pausas, retomada de save e troca de GP/circuito com UDP 2025/2026, sem comportamento anormal, travamentos ou congelamentos observados. São observações do usuário, sem medição automatizada nem comprovação de funcionamento universal. O [registro detalhado](docs/validation-v0.2c-b.md#validação-manual-com-o-f1-25-real--relato-do-usuário) mantém as limitações de UIDs, contadores, contradições, flashbacks e a intermitência gráfica. O roteiro abaixo permanece para repetição; não implica que todos os seus passos técnicos tenham sido executados.

1. Execute `npm run build` e `npm start`. Em UDP REAL, percorra TL1/TL2/TL3, classificação e corrida e compare os rótulos de sessão/circuito com o jogo. Repita em 2025 e 2026.
2. Troque de fim de semana e retome um save. Observe se contexto e métricas se atualizam sem herdar valores da transmissão anterior. Vínculos/UIDs não aparecem no painel; o [roteiro técnico](docs/validation-v0.2c-b.md#roteiro-manual-com-f1-25) explica como inspecionar o snapshot opcionalmente.
3. Faça flashbacks, pause/retome e use Alt+Tab. Desative explicitamente o UDP por mais de três segundos para verificar expiração e retomada; silêncio não deve ser declarado como pausa ou fim de sessão.
4. Alterne 2025 → 2026 → 2025, recarregue com `Ctrl+R`, alterne real/simulado e feche/reabra. Confira contexto, ausência de dados fictícios no modo real e liberação da porta.
5. Se o contexto ficar indisponível ou as métricas não retomarem, registre a sequência antes de reiniciar. Reutilização de UID bloqueado, reset de contador e mudança de contexto sob o mesmo UID continuam limitações defensivas, sem recuperação inferida.

Os resultados automatizados anteriores, a falha gráfica observada e o relato manual estão separados no [registro da versão](docs/validation-v0.2c-b.md).

### Validação V0.3A com o jogo

Em relato recebido em 15/11/2026, o usuário aprovou os sete cenários: saída dos boxes, evolução do desgaste, troca de pneus, flashback, pausa/interrupção UDP, UDP 2026 e sessões/interface/simulador. Também confirmou a distinção entre composto visual (macio, médio e duro) e físico (C3, C4 e C5 observados), sem problemas relatados. São observações do usuário, sem prova de funcionamento universal ou sincronização perfeita; veja o [relato e seus limites](docs/validation-v0.3a.md#validação-manual-com-f1-25-real--relato-do-usuário).

Para repetir e ampliar a validação, execute `npm run build` e `npm start`, configure UDP local conforme acima e compare composto visual, idade e as quatro rodas com o MFD do jogo. Faça troca de pneus e flashbacks, interrompa UDP por mais de três segundos e retome. Repita em 2025 e 2026, incluindo mudanças de sessão e alternância real/simulado. A designação física C0–C6 pode não estar visível no HUD: não deduza sua correção apenas pela cor do composto. O [roteiro completo](docs/validation-v0.3a.md#roteiro-de-validação-manual-com-f1-25) permanece disponível para repetição.

## Limitações e próximas entregas

A V0.3A decodifica os três indicadores do jogador primário em IDs 2/6, contexto mínimo do ID 1 e composto/idade/desgaste de pneus nos IDs 7/10, versão 1, formatos 2025/2026. Não há parser completo, estratégias, previsão de degradação, inventário de pneus, temperatura/pressão, combustível/ERS, gaps, clima, bandeiras, Safety Car/VSC, rádio/voz, overlay, atalhos, reconciliação completa de flashbacks/pausas, gravação, replay, banco de dados ou instalador Windows. A ordenação modular por grupo pressupõe distância inferior a meia faixa uint32; empates e ambiguidades são descartados. A confirmação de identidade e a fila dos oito últimos UIDs substituídos reduzem alternâncias indevidas, sem autenticar o emissor nem garantir proteção contra todo atraso. Não há histórico persistente. Pacotes repetidos podem continuar chegando com o jogo parado e não mantêm medições frescas.

O uso futuro será local, offline e com um único monitor. O aplicativo não injeta código nem manipula o processo do jogo. Não depende de ReShade, Project Halo ou outros addons visuais. Não há suporte específico a SWOFTY Progressive Career nem a temporadas históricas.

A recepção com o F1 25 real foi relatada na V0.2A; a primeira comparação visual dos indicadores com o HUD foi relatada na V0.2B, nos formatos 2025 e 2026. As validações manuais da V0.2C-A e V0.2C-B também foram relatadas. A integração do PR #6 à main, commit `054328d`, foi confirmada na preparação da V0.3A. Os testes automatizados usam conteúdo sintético e permanecem separados dessas observações. Após o relato manual da V0.3A, o usuário autorizou commit e push exclusivamente da branch `feat/v0.3a-tyre-monitoring`. A revisão técnica independente permanece pendente antes do merge; não há autorização para integrar à main.

Referências técnicas: [electron-vite](https://electron-vite.org/guide/) e [segurança do Electron](https://www.electronjs.org/docs/latest/tutorial/security).
