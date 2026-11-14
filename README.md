# ROSSI Pitwall — V0.2A

Fundação de um aplicativo desktop para Windows que futuramente atuará como engenheiro de corrida local para o **EA SPORTS F1 25**, com temporada **2026** por pacote visual e física padrão do jogo.

**Velocidade, marcha e volta continuam exclusivamente fictícias.** O selo **SIMULAÇÃO** permanece visível. A V0.2A adiciona recepção UDP e diagnóstico de cabeçalhos em um painel separado, sem interpretar os dados de corrida. O simulador funciona sem abrir o F1 25.

## Escopo implementado

- Janela Electron convencional, redimensionável, com interface React em português brasileiro.
- Estado da fonte, velocidade (km/h), marcha e volta, recebidos por IPC.
- Simulador determinístico no Main: primeira amostra imediata, atualizações a cada 250 ms, volta fictícia de 60 segundos.
- Inicialização e parada idempotentes, inscrições canceláveis e encerramento dos recursos com a janela.
- Receptor UDP independente do React, usando `node:dgram` no Main, em `127.0.0.1:20777` por padrão.
- Porta configurável, estados de recepção, contadores de pacotes/bytes e tratamento de porta ocupada sem interromper o simulador.
- Inspeção dos cabeçalhos 2025/2026 conforme a EA; formatos desconhecidos são informados sem interpretar o layout.
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

Ele abre uma janela Electron real, verifica isolamento, API restrita, simulação contínua, recepção de uma **fixture sintética UDP**, diagnóstico inicial, silêncio após 3 segundos, recarga e largura mínima. Fecha a janela automaticamente e retorna código zero em caso de sucesso. Usa uma porta local efêmera, sem depender da porta do jogo. O perfil e as imagens de verificação ficam em `.smoke-profile/`, ignorado pelo Git. Precisa de uma sessão gráfica do Windows.

Há também cenários de porta ocupada e configuração inválida:

```powershell
$env:ROSSI_SMOKE_UDP_MODE = 'occupied'
npm run test:smoke
$env:ROSSI_SMOKE_UDP_MODE = 'invalid'
npm run test:smoke
$env:ROSSI_SMOKE_UDP_MODE = $null
```

Os resultados efetivamente obtidos e as pendências desta entrega estão em [Validação V0.2A](docs/validation-v0.2a.md).

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
      UdpReceiver.ts                 Socket, contadores e diagnóstico
    telemetry/
      SimulatedTelemetrySource.ts    Geração determinística no Main
  preload/
    index.ts                         Ponte restrita window.pitwall
  renderer/
    index.html                       Documento e política de conteúdo
    src/
      App.tsx                        Interface e inscrição com cleanup
      UdpDiagnostics.tsx             Diagnóstico separado das métricas simuladas
      main.tsx                       Entrada React com StrictMode
      env.d.ts                       Tipagem da API exposta
      styles.css                     Identidade visual e layout responsivo
  shared/
    telemetry.ts                     Amostra, estado e contrato da fonte
    ipc.ts                           Canal e API pública
    udp.ts                           Contrato de diagnóstico (sem TelemetrySample)
tests/
  simulated-telemetry.test.ts
  preload.test.ts
  udp-header.test.ts
  udp-receiver.test.ts
  fixtures/f1-header.ts               Cabeçalho sintético documentado
scripts/
  smoke.cjs                          Integração com Electron real
```

Fluxo: **SimulatedTelemetrySource → Main → canal `pitwall:telemetry` → Preload → React**.

Fluxo adicional: **UDP local → UdpReceiver → Main → canal `pitwall:udp-diagnostics` → Preload → painel de diagnóstico**. O UDP não alimenta as métricas simuladas.

O Main é dono da fonte e do timer. A janela inicia a fonte quando a página termina de carregar. Recarregar a página não cria outro timer nem reinicia a sequência. Ao fechar a janela ou sair do aplicativo, o Main cancela sua inscrição e para a fonte.

O Preload oferece apenas `window.pitwall.onTelemetry(callback)` e `window.pitwall.onUdpDiagnostics(callback)`, ambas com cancelamento individual. O evento interno do Electron não chega ao React. O `useEffect` da interface usa o cancelamento como cleanup, inclusive no ciclo adicional do StrictMode. Ao inscrever o diagnóstico, o Preload solicita o snapshot atual pelo canal interno `pitwall:udp-diagnostics:request`, sem argumentos, evitando perda do estado inicial se o React montar depois do carregamento.

O único pedido do Renderer ao Main lê o diagnóstico atual; o Main verifica a janela e o frame remetentes. Não há comandos de rede nem configuração expostos ao React. `contextIsolation` e `sandbox` estão habilitados; `nodeIntegration` e `webviewTag`, desabilitados. Novas janelas, navegações iniciadas pela página e permissões são bloqueadas. O preload é um único bundle CommonJS compatível com sandbox. A política de conteúdo permite o preâmbulo inline do React Refresh somente no desenvolvimento; scripts inline são bloqueados no build de produção.

### Contrato da fonte

`TelemetrySource` define `start`, `stop`, `getSnapshot` e `subscribe`. A inscrição entrega o estado atual imediatamente. `stop` notifica o estado `stopped`, cancela o timer e mantém a última amostra; depois de retornar, não emite mais eventos. As inscrições permanecem até o consumidor cancelá-las, permitindo reiniciar a fonte com os mesmos consumidores. O Main sempre cancela a sua no encerramento.

O simulador reinicia a sequência ao chamar `start` após `stop`. Usa o identificador fixo `simulation-v0.1`, sem aleatoriedade nem dependência do relógio real. Ele não reproduz a física do F1 25; velocidades, marchas e duração das voltas são apenas demonstrativas.

Os metadados simulados incluem origem, sessão, frame, tempo da sessão e versão do protocolo. `protocolVersion: null` continua correto para o simulador. O valor `udp` permanece reservado no contrato de amostras: o novo receptor usa `UdpDiagnosticSource`, sem fabricar velocidade, marcha ou volta reais.

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

1. Execute `npm run dev` sem abrir o F1 25.
2. Confirme o nome ROSSI PITWALL, o selo SIMULAÇÃO e o estado Fonte ativa.
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

Mesmo recebendo UDP, **velocidade, marcha e volta continuam fictícias**. Cabeçalho reconhecido não valida o payload nem autentica que o remetente é o jogo. O parser de corrida fica para uma próxima entrega explicitamente autorizada.

## Limitações e próximas entregas

A V0.2A acrescenta somente recepção e diagnóstico UDP à fundação V0.1. Não há parser de payload, velocidade/marcha/volta reais, identificação operacional de sessão, estratégias, dados reais de pneus/combustível/ERS, gaps, clima, bandeiras, Safety Car/VSC, rádio/voz, overlay, atalhos, reconciliação de flashbacks/pausas, gravação, replay, banco de dados ou instalador Windows.

O uso futuro será local, offline e com um único monitor. O aplicativo não injeta código nem manipula o processo do jogo. Não depende de ReShade, Project Halo ou outros addons visuais. Não há suporte específico a SWOFTY Progressive Career nem a temporadas históricas.

A recepção com o F1 25 real já foi relatada para os formatos 2025 e 2026. O parser de telemetria real está fora desta implementação. Esta entrega não inclui merge nem exclusão de branches.

Referências técnicas: [electron-vite](https://electron-vite.org/guide/) e [segurança do Electron](https://www.electronjs.org/docs/latest/tutorial/security).
