# Verificação da entrega

Ambiente: Windows, Node 22.22.3, npm 10.9.8. Cliente em America/Sao_Paulo; trabalho iniciado em 06/10/2026. Diretório original vazio, sem Git. Não foram feitas chamadas autenticadas a Azure, OpenAI ou Azure OpenAI.

## Comandos executados

| Comando | Finalidade |
| --- | --- |
| `npm view ... version` | Verificar versões estáveis disponíveis das dependências principais |
| `npm install` | Instalar a stack inicial |
| `npx playwright install chromium` | Disponibilizar o browser de testes |
| `npm uninstall eslint-config-next` + instalação de ESLint/TS/hooks/a11y | Remover dependência transitiva de desenvolvimento com advisory sem correção disponível |
| `npm install --package-lock-only` | Alinhar lockfile após fixar versões diretas |
| `npm ci` | Confirmar instalação limpa e reproduzível |
| `npm run lint` | Regras de TypeScript, React Hooks e acessibilidade JSX |
| `npm run typecheck` | Verificar TypeScript strict |
| `npm test` | Testes de domínio, sanitização, diagnóstico, providers e rota |
| `npm run test:e2e -- --workers=1` | Jornadas por Chromium em seis larguras |
| `npm run build` | Produzir pacote Next.js de produção |
| `npm start` | Executar e verificar o build em endereço local |
| `npm audit --json` | Verificar dependências de produção e desenvolvimento |

## Evidências

Instalação limpa: exit 0; audit com zero vulnerabilidades. Lint e typecheck finais: exit 0, sem erros ou avisos do código. Build final depois do refinamento de fontes do assistente: exit 0, rota principal estática e rota `/api/assistant` dinâmica. Suite unitária/integração: 138 testes em nove arquivos, todos verdes. Interface: 24 testes, todos verdes contra o servidor de produção final, incluindo 320, 360, 390, 768, 1024 e 1440 px.

Inspeção visual por capturas: home desktop, home 320 px, Doctor 320 px e grafo com detalhes. Os controles de zoom possuem labels em português e área de toque ampliada. Menu drawer, fechamento de tela cheia por Escape, preview de IA e persistência de progresso testados.

Testes iniciais falharam na ausência de implementação. Os ciclos de regressão da revisão reproduziram e corrigiram cookies citados/senhas com espaços, prioridade de erros reais, branches inválidos sem avisos e associação de findings por prefixo. Falhas de seletores Playwright foram corrigidas para distinguir input de arquivo/editor e evitar o route announcer do Next. Links React duplicados passaram a usar chaves únicas.

## Limites da evidência

Providers reais têm testes de contrato com resposta HTTP controlada, não execução com credenciais. UI verificada em Chromium; leitores de tela, outros browsers, rede Azure, runtime Logic Apps e connectors reais não foram exercitados. Fixtures contêm somente dados sintéticos. O npm avisa que ESLint 9 saiu de suporte; atualização depende de compatibilidade declarada do peer JSX a11y e está no backlog.

Repetição final concluída após integrar as fontes curadas. A revisão independente também aprovou esse adendo e executou 20 testes de providers/rota sem falhas. O servidor de produção permanece iniciado em http://127.0.0.1:3000; preview solicitado no painel do Codex. Sem autenticação externa, recursos Azure, commits ou publicação remota.

## Atualização: provedores gratuitos — 07/10/2026

Implementados OpenRouter e NVIDIA Build, catálogo público de configuração, seletor por envio e prévia vinculada ao destino. Chaves somente no ambiente do servidor; sem inferência externa autenticada.

- RED de integração: novos requests e catálogo falharam antes da implementação. RED de UI: teste encontrou ausência de “Provedor de IA”. Evidências do backend em [relatório específico](free-provider-backend-report.md).
- GREEN final: `npm test` com 200 testes em dez arquivos, `npm run typecheck`, `npm run lint` sem erros/avisos e `npm run build`, todos saída 0.
- `npm run test:e2e -- --workers=1`: 36 testes passaram em 30,6 segundos contra servidor de produção, incluindo novos provedores, ausência de chave, sanitização, consentimento por destino e seis larguras de 320 a 1440 px.
- Capturas `test-results/assistant-nvidia-320.png` e `test-results/assistant-nvidia-1440.png` inspecionadas. Ajuda e seletor legíveis, com quebra de linhas de configuração e sem overflow horizontal.
- GET real de `/api/assistant` confirmou Mock disponível e novos providers sem configuração, sem segredos ou endpoints privados. Não houve chamada de inferência externa.
- Não houve mudança de dependências; audit zero e instalação limpa continuam como evidências da entrega inicial, sem novo audit necessário neste escopo.

Modelos/termos foram consultados em fontes oficiais em 07/10/2026. Disponibilidade e limites da conta, validade de chave, qualidade do modelo e compatibilidade do toggle de raciocínio NVIDIA no serviço hospedado permanecem sem validação autenticada. Guia: [ativação](free-ai-providers.md). Revisão: [provedores gratuitos](free-provider-review.md).

## Atualização: construtor de workflows — 11/10/2026

Verificação final local para o construtor em linguagem natural de Logic Apps Consumption. Ambiente: Windows, Node 22.22.3, npm 10.9.8, Next.js 16.4.0 e Chromium.

| Comando | Resultado |
| --- | --- |
| `npm run lint` | Exit 0, sem erros ou avisos. |
| `npm run typecheck` | Exit 0. |
| `npm test` | 272 testes em 15 arquivos, todos passaram. |
| `npm run test:e2e -- --workers=1` | 48 testes Chromium, todos passaram. |
| `npm run build` | Exit 0; `/` estática e as rotas `/api/assistant` e `/api/workflow-builder` dinâmicas. |

Os testes E2E confirmam a escolha entre a proposta local e o construtor; orientação sem provedor ou com Mock; prévia editável e invalidada ao editar/trocar provedor; contexto anterior visível; autorização de uso único; ciclo `needs-input`/`ready`; bloqueio de resposta incompatível; revisão e confirmação do plano; validação, prévia e download de `azuredeploy.json` e `README.md`. As verificações de overflow passaram em 320, 360, 390, 768, 1024 e 1440 px para seleção, prévia, plano e artefatos, incluindo o bloco de código. Foco por teclado e labels acessíveis foram exercitados.

Inspeção visual das telas de consentimento e pacote em 320 e 1440 px. As telas ficaram em coluna em dispositivos estreitos, endpoints e JSON quebraram linha, e os links de download permaneceram utilizáveis. As larguras intermediárias foram cobertas pelos testes E2E.

As respostas de IA do E2E e os contratos HTTP dos provedores são controlados pelos testes. Nenhuma chave real foi usada; não houve inferência autenticada, teste de endpoint fornecido, validação no portal/ARM, importação ou execução de workflow no Azure. A validação local cobre apenas o subconjunto implementado e não prova que o runtime aceitará um pacote específico. Nenhuma dependência mudou nesta etapa; o audit não foi repetido. A alteração preexistente de `next-env.d.ts` permaneceu fora dos commits.

Fontes oficiais usadas para documentar o artefato: [referência do recurso Microsoft.Logic/workflows](https://learn.microsoft.com/en-us/azure/templates/microsoft.logic/workflows), [quickstart Consumption com ARM](https://learn.microsoft.com/en-us/azure/logic-apps/quickstart-create-deploy-azure-resource-manager-template), [parâmetros de workflow](https://learn.microsoft.com/en-us/azure/logic-apps/create-parameters-workflows), [schema WDL](https://learn.microsoft.com/en-us/azure/logic-apps/workflow-definition-language-schema) e [dados seguros no histórico](https://learn.microsoft.com/en-us/azure/logic-apps/set-up-security-permissions). Consulte também o [guia do construtor](workflow-builder.md).

## Atualização: OpenAI GPT-6 Luna — 11/10/2026

O provedor OpenAI existente agora usa `gpt-6-luna` como padrão. Basta configurar `OPENAI_API_KEY`; `OPENAI_MODEL` continua opcional para manter compatibilidade com contas que habilitaram outro modelo. Os seletores do assistente e do construtor informam cobrança por uso e ausência de nível gratuito. Referências oficiais: [modelo e limites](https://developers.openai.com/api/docs/models/gpt-6-luna) e [preços](https://developers.openai.com/api/docs/pricing).

- `npm run lint`, `npm run typecheck`, `npm test` (273 testes em 15 arquivos) e `npm run build`: passaram.
- `npm run test:e2e -- --workers=1`: 50 testes passaram contra produção. Seleção, chave e preços foram conferidos no assistente e no construtor; a ajuda OpenAI foi verificada em 320, 360, 390, 768, 1024 e 1440 px.
- Inspeção visual das capturas de configuração em 320 e 1440 px: texto e campos legíveis, sem overflow horizontal.
- GET de `/api/assistant` retornou HTTP 200 e somente o catálogo público; OpenAI aparece desconfigurado sem chave e nenhum segredo é exposto. A página local permanece disponível em http://127.0.0.1:3000.
- Nenhuma chave real foi usada e não houve chamada autenticada. A integração foi verificada por contrato controlado; acesso, cobrança da conta e cota dependem da configuração do usuário.
