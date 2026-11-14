# ROSSI Pitwall — V0.1

Fundação de um aplicativo desktop para Windows que futuramente atuará como engenheiro de corrida local para o **EA SPORTS F1 25**, com temporada **2026** por pacote visual e física padrão do jogo.

**Esta versão usa exclusivamente dados fictícios.** Não recebe telemetria do jogo e funciona sem abrir o F1 25. O selo **SIMULAÇÃO** permanece visível.

## Escopo implementado

- Janela Electron convencional, redimensionável, com interface React em português brasileiro.
- Estado da fonte, velocidade (km/h), marcha e volta, recebidos por IPC.
- Simulador determinístico no Main: primeira amostra imediata, atualizações a cada 250 ms, volta fictícia de 60 segundos.
- Inicialização e parada idempotentes, inscrições canceláveis e encerramento dos recursos com a janela.
- Contratos pequenos para futuras fontes; nenhuma implementação UDP nesta entrega.
- Testes unitários com Vitest e teste de integração com Electron real.

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

Ele abre uma janela Electron real, verifica isolamento, API, recebimento contínuo de dados, valores exibidos no React e recarga da página; fecha a janela automaticamente e retorna código zero em caso de sucesso. Precisa de uma sessão gráfica do Windows. O perfil descartável fica em `.smoke-profile/`, ignorado pelo Git.

Para verificar também o caminho de desenvolvimento, com o mesmo teste:

```powershell
npm run dev -- --entry scripts/smoke.cjs
```

## Arquitetura

```text
src/
  main/
    index.ts                         Janela, segurança, IPC e ciclo de vida
    telemetry/
      SimulatedTelemetrySource.ts    Geração determinística no Main
  preload/
    index.ts                         Ponte restrita window.pitwall
  renderer/
    index.html                       Documento e política de conteúdo
    src/
      App.tsx                        Interface e inscrição com cleanup
      main.tsx                       Entrada React com StrictMode
      env.d.ts                       Tipagem da API exposta
      styles.css                     Identidade visual e layout responsivo
  shared/
    telemetry.ts                     Amostra, estado e contrato da fonte
    ipc.ts                           Canal e API pública
tests/
  simulated-telemetry.test.ts
  preload.test.ts
scripts/
  smoke.cjs                          Integração com Electron real
```

Fluxo: **SimulatedTelemetrySource → Main → canal `pitwall:telemetry` → Preload → React**.

O Main é dono da fonte e do timer. A janela inicia a fonte quando a página termina de carregar. Recarregar a página não cria outro timer nem reinicia a sequência. Ao fechar a janela ou sair do aplicativo, o Main cancela sua inscrição e para a fonte.

O Preload oferece apenas `window.pitwall.onTelemetry(callback)`, que retorna uma função de cancelamento. Cada inscrição remove somente seu próprio listener. O evento interno do Electron não chega ao React. O `useEffect` da interface usa essa função como cleanup, inclusive no ciclo adicional do StrictMode em desenvolvimento.

Não há comandos IPC do Renderer para o Main nesta versão. `contextIsolation` e `sandbox` estão habilitados; `nodeIntegration` e `webviewTag`, desabilitados. Novas janelas, navegações iniciadas pela página e permissões são bloqueadas. O preload é um único bundle CommonJS compatível com sandbox. A política de conteúdo permite o preâmbulo inline do React Refresh somente no desenvolvimento; scripts inline são bloqueados no build de produção.

### Contrato da fonte

`TelemetrySource` define `start`, `stop`, `getSnapshot` e `subscribe`. A inscrição entrega o estado atual imediatamente. `stop` notifica o estado `stopped`, cancela o timer e mantém a última amostra; depois de retornar, não emite mais eventos. As inscrições permanecem até o consumidor cancelá-las, permitindo reiniciar a fonte com os mesmos consumidores. O Main sempre cancela a sua no encerramento.

O simulador reinicia a sequência ao chamar `start` após `stop`. Usa o identificador fixo `simulation-v0.1`, sem aleatoriedade nem dependência do relógio real. Ele não reproduz a física do F1 25; velocidades, marchas e duração das voltas são apenas demonstrativas.

Os metadados incluem origem, sessão, frame, tempo da sessão e versão do protocolo. `protocolVersion: null` indica que não há protocolo UDP identificado. O valor `udp` está reservado no tipo de origem, sem conexão ou parser implementado.

**Tempo, frame e volta não são contratos de ordem crescente.** A interface aceita cada amostra recebida sem descartar valores menores, preparando o caminho para flashbacks. Não há detecção nem reconciliação nesta versão. O mod visual 2026 não determina a versão do protocolo; isso será investigado com dados reais em uma entrega posterior.

## Testes

Os testes unitários cobrem validade das amostras em duas voltas completas, origem simulada, metadados, periodicidade, início/parada, ausência de timers duplicados, múltiplos consumidores, cancelamentos independentes, ausência de emissões após parada, reinício e previsibilidade entre instâncias. Usam timers falsos, sem depender do F1 25.

Os testes da ponte verificam API restrita, canal específico, remoção dos eventos privilegiados, cancelamento individual e ausência de listeners acumulados no ciclo de montagem do React. O smoke test complementa esses testes verificando o fluxo real, sem substituir a validação visual humana.

## Validação manual no Windows

1. Execute `npm run dev` sem abrir o F1 25.
2. Confirme o nome ROSSI PITWALL, o selo SIMULAÇÃO e o estado Fonte ativa.
3. Observe velocidade e marcha mudando; após 60 segundos, a volta avança para 2.
4. Redimensione a janela, inclusive até o tamanho mínimo, e verifique legibilidade e ausência de cortes.
5. Feche a janela e confira que o processo termina. Execute novamente e confirme que a simulação recomeça.
6. Execute `npm run build` e `npm start` para repetir a validação com a interface compilada.

## Limitações e próximas entregas

A V0.1 é uma fundação técnica com uma janela e uma fonte simulada. Não há conexão UDP, parser, identificação real de sessão, estratégias, dados reais de pneus/combustível/ERS, gaps, clima, bandeiras, Safety Car/VSC, voz, overlay, atalhos, reconciliação de flashbacks/pausas, gravação, replay, banco de dados ou instalador Windows.

O uso futuro será local, offline e com um único monitor. O aplicativo não injeta código nem manipula o processo do jogo. Não depende de ReShade, Project Halo ou outros addons visuais. Não há suporte específico a SWOFTY Progressive Career nem a temporadas históricas.

Próximas entregas, fora desta implementação: investigar o protocolo efetivamente transmitido pelo F1 25, adicionar uma fonte UDP com fixtures reais, definir estados de conexão/pausa e regras de flashback e, posteriormente, avaliar overlay e voz local em português brasileiro.

Referências técnicas: [electron-vite](https://electron-vite.org/guide/) e [segurança do Electron](https://www.electronjs.org/docs/latest/tutorial/security).
