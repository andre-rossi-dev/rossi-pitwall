# ROSSI Pitwall — instruções de desenvolvimento

## Produto e escopo

- Aplicativo desktop Windows para engenharia de corrida em tempo real no F1 25, com foco na temporada moderna 2026.
- Manter funcionamento local e offline, sem dependências obrigatórias de nuvem ou serviços de IA pagos. A instalação de dependências pode exigir internet.
- Overlay para uso com um único monitor e engenheiro de corrida por voz em português brasileiro são objetivos futuros; não implementá-los sem solicitação explícita.
- Não oferecer suporte específico às carreiras históricas SWOFTY.
- Responder em português brasileiro. Implementar somente o escopo solicitado, preservando comportamentos aprovados e evitando alterações em arquivos sem necessidade.

## Arquitetura e segurança

- Preservar Electron, React, TypeScript, Node.js e electron-vite. Evitar dependências desnecessárias e reestruturações sem justificativa.
- Manter responsabilidades separadas: `src/main/` para recursos privilegiados e ciclo de vida; `src/preload/` para a ponte restrita; `src/renderer/` para a interface React; `src/shared/` para contratos tipados, independentes de Electron e React.
- Executar recepção UDP no Main Process com `node:dgram`, independente do Renderer. Preservar encerramento de sockets, timers e inscrições, além de início/parada idempotentes.
- Usar IPC restrito e tipado via `window.pitwall`; validar remetentes de solicitações no Main. Não expor IPC genérico, eventos privilegiados ou acesso direto ao Node.js no Renderer. Manter cancelamento individual das inscrições e cleanup no React.
- Preservar `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` e `webviewTag: false`, além dos bloqueios de navegação, novas janelas e permissões.
- Preservar a CSP de produção e o bundle CommonJS único do Preload; permissões específicas de desenvolvimento não devem alcançar produção.

## Telemetria

- Diferenciar explicitamente simulação, fixtures sintéticas e dados reais. Não inventar valores de telemetria nem preencher dados ausentes como se fossem medições reais.
- Enquanto velocidade, marcha e volta forem fornecidas pelo simulador, manter sua identificação explícita como dados fictícios. Somente apresentar métricas como reais depois de implementar e validar a decodificação UDP correspondente. Preservar a distinção entre fontes simuladas e reais.
- Seguir as especificações oficiais da EA para F1 25, referenciadas em [docs/udp-protocol.md](docs/udp-protocol.md). Preservar compatibilidade com UDP 2025 e 2026 dentro do escopo implementado; inspeção de cabeçalho não equivale a suporte ao payload completo.
- Identificar o formato por `packetFormat` recebido. Não inferir o protocolo pelo pacote visual 2026 nem pelo ano do jogo.
- Validar limites antes de ler buffers e tratar formatos desconhecidos defensivamente. Cabeçalho reconhecido não autentica o remetente nem comprova validade do payload ou ausência de perda de pacotes.
- Preservar retrocessos de frameIdentifier, tempo e volta em flashbacks. Ordenar cada grupo pela política defensiva de overallFrameIdentifier documentada em docs/udp-protocol.md, sem comparar grupos ou identidades diferentes. Duplicações e atrasos não renovam frescor; silêncio UDP não comprova pausa nem limpa identidade. Reconciliação completa de flashbacks permanece fora do escopo.
- Confirmar mudanças de identidade antes de substituir grupos e manter proteção limitada em memória contra UIDs de sessões substituídas, conforme docs/udp-protocol.md. Não misturar métricas de identidades diferentes.
- Não implementar injeção de código, controle do jogo ou contorno de proteções.

## Qualidade e evidências

- Preferir soluções simples, legíveis, sustentáveis e bem tipadas. Explicar recursos de linguagem pouco óbvios quando relevantes.
- Criar testes automatizados para novas funcionalidades e preservar a cobertura dos comportamentos aprovados. Usar `tests/` para testes Vitest e `scripts/smoke.cjs` para integração com Electron real.
- Manter fixtures sintéticas identificadas; testes com sockets locais e conteúdo sintético não substituem validação com o jogo real.
- Diferenciar evidências verificadas, relatos do usuário, hipóteses e limitações. Informar apenas resultados de testes efetivamente executados, distinguindo-os de registros históricos.
- Documentar falhas intermitentes e sua causa, quando conhecida. Uma repetição aprovada não comprova resolução definitiva.

## Fluxo de desenvolvimento

- Antes de modificar arquivos, inspecionar o estado do Git, o código, os testes e a documentação envolvidos. Explicar brevemente o plano antes de mudanças grandes.
- Trabalhar em branches específicas por funcionalidade ou manutenção. Preservar alterações locais existentes; não executar comandos Git destrutivos.
- Não fazer commit, push ou merge sem autorização explícita na tarefa atual. Quando autorizado, usar mensagens no padrão Conventional Commits.
- Priorizar testes específicos durante a implementação. Antes da entrega de código, executar checagem de tipos, suíte completa e build; executar integração gráfica quando pertinente. Para alterações exclusivamente documentais, revisar precisão, escopo e whitespace.
- Revisar o diff e executar `git diff --check` antes de solicitar aprovação. Verificar também arquivos novos ainda não rastreados.
- Concluir com resumo técnico, arquivos modificados, verificações executadas, resultados reais e limitações, incluindo verificações não realizadas.

## Comandos e referências

Os scripts de [package.json](package.json) são a fonte de verdade:

| Comando | Finalidade |
| --- | --- |
| `npm run dev` | Executar em desenvolvimento. |
| `npm run typecheck` | Verificar tipos de Node/Electron e navegador. |
| `npm run test` | Executar a suíte Vitest uma vez. |
| `npm run build` | Verificar tipos e compilar Main, Preload e Renderer. |
| `npm start` | Abrir o build de produção; não gera instalador. |
| `npm run test:smoke` | Testar integração com Electron real; requer build prévio e sessão gráfica do Windows. |

- Consultar o [README.md](README.md) para instalação, execução, arquitetura, configuração e limites do produto.
- Consultar [docs/udp-protocol.md](docs/udp-protocol.md) para fontes oficiais, layout e políticas; os registros docs/validation-v0.2a.md, docs/validation-v0.2b.md e docs/validation-v0.2c-a.md distinguem evidências e limitações de cada entrega.
- Manter versões, offsets, parâmetros operacionais e resultados de validação nos documentos apropriados, evitando duplicá-los aqui. Não registrar credenciais, informações pessoais, caminhos locais ou parâmetros temporários como regras permanentes.
- Atualizar este arquivo quando decisões arquiteturais mudarem, mantendo-o conciso e coerente com o código e a documentação.
