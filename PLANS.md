# Logic Apps Compass Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for independent modules and inline integration. Steps use checkbox syntax.

**Goal:** Implementar o MVP funcional descrito em docs/product-spec.md e no pedido anexado.
**Architecture:** Domínio puro local, interface por feature e IA opcional por rota server-side com consentimento e sanitização.
**Tech Stack:** Next.js 16.4.0, React 19.3.0, TypeScript strict, npm, Tailwind 4, Radix, React Flow, Zod, Vitest, Playwright.
**Spec:** docs/product-spec.md. O texto anexado é a fonte integral de requisitos.

## Global Constraints
Português brasileiro na UI; nomes de código em inglês; sem `any`; sem credenciais; original imutável; funcionamento sem IA; nenhuma escrita no Azure; sem env NEXT_PUBLIC para segredos.

## Review Focus
Nomes de actions repetidos em branches; entradas arbitrárias e estruturas parcialmente válidas; segredos embutidos em strings JSON e URLs; classificação sem status ou com vários erros; overflow em 320 px e consentimento invalidado quando contexto muda.

## Task 1: Workflow domain
Files: `src/types/workflow.ts`, `src/lib/logic-apps/{parser,graph,rules,explanations}`, `src/content/examples`, `tests/fixtures`, `tests/unit/workflow*.test.ts`, `docs/analysis-rules.md`.
Interfaces: `parseWorkflow(input: string): ParsedWorkflow`; `analyzeWorkflow(workflow: ParsedWorkflow): Finding[]`; `buildWorkflowGraph(workflow: ParsedWorkflow): WorkflowGraph`.
- [x] Testes primeiro: recursão de todos os containers, path e IDs, tipos desconhecidos, multistatus, forma inválida, graph e regras com evidência.
- [x] Confirmar falha; implementar funções puras; confirmar testes verdes.
- [x] Revisar parser, regras e limites contra requisitos.

## Task 2: Privacy, diagnostics and assistant
Files: `src/lib/security/redaction`, `src/lib/diagnostics`, `src/lib/ai`, `src/app/api/assistant`, `tests/unit/{redaction,diagnostics,ai}.test.ts`, `tests/fixtures/errors`.
Interfaces: `redactContent(content: string, options?: RedactionOptions): RedactionResult`; `diagnoseError(input: string): Diagnosis`; provider request contract e GET status/POST consentido.
- [x] Testar primeiro segredos estruturados/textuais, PII opcional, todos os erros, insuficiência de dados e bloqueio de envio sem consentimento.
- [x] Implementar redaction, Doctor, Mock/OpenAI/Azure providers e rota com validação, timeout e mensagens seguras.
- [x] Rever ausência de envio automático e exposição de dados.

## Task 3: Knowledge, learning, templates and wizard
Files: `src/content/{knowledge,lessons,templates}`, `src/lib/architecture`, `src/features/{architecture-wizard,learning,templates}`, `tests/unit/architecture.test.ts`.
Interfaces: conteúdo tipado; componentes `ArchitectureWizard`, `LearningCenter`, `TemplateCatalog`; callback `onOpenTemplate(json: string)`.
- [x] Verificar URLs oficiais; implementar 18 documentos, 13 aulas e 8 templates completos.
- [x] Testar primeiro recomendação com informação suficiente/insuficiente; implementar wizard e progresso local.
- [x] Rever exemplos educacionais e referências.

## Task 4: Interface and integration
Files: `src/app/{layout,page,globals.css}`, `src/components`, `src/features/{workflow-analyzer,workflow-visualizer,diagnostics,assistant}`, `tests/e2e/compass.spec.ts`.
- [x] Escrever Playwright para exemplos, paste, inválido, detalhes, filtros, Doctor, mobile, sem chave e prévia de IA; observar falha inicial.
- [x] Implementar shell, home, analyzer com abas e detalhes, grafo, Doctor e painel de consentimento.
- [x] Verificar capturas desktop e móvel; corrigir estados reais e acessibilidade.

## Task 5: Delivery verification
Files: `README.md`, `AGENTS.md`, `PLANS.md`, demais docs.
- [x] Revisão independente do conjunto e correção de achados.
- [x] Executar lint, typecheck, unitários, Playwright em seis larguras e build de produção.
- [x] Documentar comandos, resultados e limitações reais; iniciar preview local.

## Ledger
06/10/2026: inspeção completa do diretório vazio. Ruling: implementar no diretório solicitado, pois não existe Git/worktree anterior. Ruling: pedido explícito de prosseguir sem interrupções prevalece sobre gates adicionais de aprovação dos skills. Ruling: módulos independentes com propriedade de arquivos exclusiva executam em paralelo conforme instruções de colaboração; integração e mutações compartilhadas ficam com o agente principal.

| Verificação de interfaces do plano | Resultado |
| --- | --- |
| Task 1 parser/rules/graph → Task 4 Analyzer | ParsedWorkflow/Finding/WorkflowGraph definidos em src/types/workflow.ts; IDs por path; triggers marcados isTrigger. Compatível. |
| Task 2 redaction/Doctor/AI → Task 4 painéis | RedactionResult.content/redactionCount e Diagnosis usados diretamente. Pergunta 6.000/contexto 100.000 alinhados com servidor. Compatível. |
| Task 3 conteúdo/wizard → Task 4 shell | Componentes nomeados e onOpenTemplate(json:string). Compatível. |
| Tasks 1–4: consistência interna | Arquivos de propriedade exclusiva, funções puras testadas, templates não implantáveis identificados, UI local sem conta. Requisitos e testes coerentes. |

Task 1: complete — 50 testes de workflow, inclui regressões de else/default/cases malformados.
Task 2: complete — sanitização e Doctor revisados com regressões para segredos citados/espaços e evidência de falha real; APIs reais testadas por contrato sem chaves.
Task 3: complete — 18 documentos, 13 aulas, 8 templates; domínio e conteúdo com testes; progresso local; links com chaves únicas.
Task 4: complete — 24 cenários de interface passaram nas seis larguras, incluindo colisão de paths, controles traduzidos e execução contra produção.
Revisão independente: R1–R4 corrigidos e aprovados; adendo de fontes curadas também aprovado. 138 unitários/integração passaram na verificação final. Consulte docs/review-report.md.
Ruling: usar Radix diretamente com composição acessível, sem dependência shadcn obrigatória — preferência do pedido permite esta biblioteca — mantém o escopo e evita scaffolding remoto desnecessário.
Ruling: substituir eslint-config-next por ESLint/TypeScript/React Hooks/JSX a11y — elimina advisory transitivo de desenvolvimento sem correção disponível, preserva lint e stack Next.
Ruling: limitar contexto de IA em vez de truncar silenciosamente — usuário deve selecionar uma action ou desmarcar payload grande — mantém prévia fiel ao envio.

## Task 7: GitHub Actions CI (11/10/2026)
Pedido: iniciar pelas melhorias de qualidade com verificações automáticas em GitHub.
- [x] Workflow para push/PR em main e acionamento manual; npm ci, lint, typecheck, unit/integration, Playwright Chromium e build.
- [x] Permissões mínimas de leitura, Node.js 22, cache npm, cancelamento de execuções redundantes.
- [x] Primeira execução automática: [GitHub Actions #38150255274](https://github.com/Ciuryo/Logic-Apps-Compass/actions/runs/38150255274) concluída com sucesso em 11/10/2026.
Verificação executada pelo GitHub em `main`, commit `4212bc3`: lint, typecheck, 200 testes unitários/integração, 36 testes Playwright/Chromium e build de produção, todos aprovados. Nenhum segredo foi usado.

## Estado da entrega
Implementado: domínio local, quatro jornadas, grafo, Doctor, sanitização/consentimento, wizard, construtor de workflows Consumption, trilha, conhecimento, templates e providers.
Parcialmente verificado: OpenAI/Azure com conta real e browsers além de Chromium; não havia credenciais nem chamadas externas autorizadas para essa validação.
Backlog: controles corporativos ao expor na rede, autenticação, rate limit distribuído, múltiplos workflows por arquivo, demais exclusões em docs/backlog.md.
Task 5: complete — instalação limpa npm ci, lint sem erros/avisos, TypeScript strict, 138 testes em 9 arquivos, 24 testes de interface contra produção e build de produção passaram. Audit: zero vulnerabilidades. Servidor de produção iniciado em http://127.0.0.1:3000; solicitado preview no painel do Codex.
Refinamento final: providers recebem resumos e referências verificadas da base local; Mock cita fontes por modo; URLs fora do catálogo permanecem pendentes. Testes de whitelist, exclusão e deduplicação passaram e mudança foi revisada independentemente.
Entrega local no diretório original. Sem Git anterior, commits, push, PR, merge ou deploy Azure não foram necessários nem executados.

## Task 6: Provedores gratuitos (07/10/2026)
Pedido: adicionar OpenRouter e NVIDIA Build ao assistente existente.
Decisão: seletor por envio, chaves somente no ambiente do servidor, Mock disponível sem chave. OpenRouter usa `openrouter/free` por padrão e aceita somente esse roteador ou IDs terminados em `:free`; nenhum fallback pago. NVIDIA usa `nvidia/nemotron-3-ultra-550b-a55b`, endpoint gratuito disponível no catálogo, para desenvolvimento/avaliação sujeito aos termos e limites da conta.
Interface: `AiProviderId = mock | openrouter | nvidia | openai | azure`; `AiRequest.provider?`; `ProviderStatus.id: AiProviderId | null`; `ProviderCatalog extends ProviderStatus { providers: ProviderStatus[] }`. GET entrega catálogo público sem chaves/modelos privados; POST valida provider opcional e usa somente a escolha autorizada. Mudança de provedor invalida a prévia.
Arquivos do backend: src/lib/ai/{types,index,providers}.ts, src/app/api/assistant/route.ts, testes unitários e de integração correspondentes. Arquivos da interface/documentação: src/features/assistant/index.tsx, tests/e2e/assistant-providers.spec.ts, .env.example, README e docs.
- [x] Testes de contrato primeiro e falha confirmada; implementar adapters Chat Completions e seleção por pedido.
- [x] Testes de interface primeiro e falha confirmada; implementar seletor, limites de gratuidade e ajuda de ativação.
- [x] Revisão independente; lint, tipos, testes unitários/integração, interface responsiva e build.
- [x] Reiniciar preview e registrar evidências e limites.

| Interfaces compartilhadas | Verificação do plano |
| --- | --- |
| Backend → UI | ProviderCatalog inclui o status do padrão e lista de status por ID; UI importa somente tipos. Chaves nunca retornam. Compatível. |
| UI → POST | ID do seletor junto com consentimento explícito e prévia; enum validado no servidor. Compatível. |
| Providers → privacidade | Mesmas instruções curadas, sanitização de entrada/saída, whitelist de fontes, timeout e erro seguro. Compatível. |
| Configuração → custo | Somente modelos gratuitos OpenRouter; NVIDIA identificada como avaliação sujeita a limites. Não prometer acesso ilimitado. |
Ruling: continuar sem novos gates de aprovação — pedido explícito de implementar e continuar; nenhum segredo disponível nem criação de conta necessária para entregar a integração. Validação autenticada permanece pendente até configuração de chave.
Implementação: 62 novos testes unitários/integração e 12 novos E2E; 200/200 e 36/36 passaram. RED de interface confirmado na ausência do seletor. Um teste novo assumia modo Explain na home (que inicia Teach); corrigido para selecionar explicitamente Explain. Build, lint e tipos passaram; GET real confirmou o catálogo seguro. Capturas do assistente com ajuda NVIDIA em 320 e 1440 px inspecionadas. Nenhuma dependência mudou. Servidor de produção iniciado em http://127.0.0.1:3000.
Task 6: complete — revisão independente aprovada sem achados bloqueadores e 82 testes de contratos executados pelo revisor. Guias, env de exemplo e evidências atualizados. Sem chaves, chamadas autenticadas, criação de conta ou mudanças no Azure.

## Task 8: Construtor de workflows em linguagem natural (11/10/2026)

Decisão: adicionar a jornada Consumption ao “Quero criar” sem substituir a proposta local. O MVP gera um plano JSON validado para gatilho `Request`/`Recurrence` e actions HTTP/Compose/Response; não permite que o modelo escreva WDL ou ARM diretamente.

- [x] Definir schema, limites, validações semânticas, geração WDL/ARM e validação local dos artefatos.
- [x] Criar `POST /api/workflow-builder` com consentimento estrito, sanitização, provedor real configurado, perfil de prompt fixo e validação de resposta `unknown`.
- [x] Integrar seleção de jornada, prévia editável da pergunta e contexto, autorização por envio, revisão/confirmação do plano e downloads após validação.
- [x] Preservar a proposta local e documentar limites, privacidade, configuração de provedores e referências oficiais em [docs/workflow-builder.md](docs/workflow-builder.md).
- [x] Verificar lint, TypeScript, testes, E2E em seis larguras e build; registrar evidências em [docs/verification.md](docs/verification.md).

Implementação em commits locais `535ff85`, `31d890a`, `652114c` e `c3bcb79`. Verificação: 272 testes unitários/integração em 15 arquivos e 48 testes E2E passaram; lint, typecheck e build passaram. E2E conferiu seleção, prévia, plano e código gerado em 320, 360, 390, 768, 1024 e 1440 px. Não foram usadas chaves reais nem executadas chamadas autenticadas, validações de endpoint ou implantações Azure.
Ruling: endpoint do plano é exibido para conferência humana; HTTPS e formato do contrato são verificados localmente, mas a conectividade, propriedade e compatibilidade real da API não são inferidas.

## Task 9: OpenAI GPT-6 Luna — 11/10/2026

Pedido: disponibilizar o modelo Luna 6 no assistente especializado e no construtor de workflows.

- [x] Testar chave OpenAI sem `OPENAI_MODEL` e confirmar o envio do identificador `gpt-6-luna`.
- [x] Usar GPT-6 Luna como modelo padrão do provedor OpenAI, mantendo a chave no servidor e sem fallback.
- [x] Mostrar a configuração e os preços nos dois seletores; documentar cobrança por uso e ausência de nível gratuito para esse modelo.
- [x] Verificar consentimento existente, lint, tipos, testes, E2E responsivo, build e catálogo público.

Verificação: 273 testes unitários/integração em 15 arquivos, 50 E2E em Chromium, lint, typecheck e build passaram. Ajuda do provedor inspecionada em 320 e 1440 px; o catálogo público não expõe chaves. OpenAI Docs consultada em 11/10/2026 confirma endpoint Responses, cobrança por tokens e ausência de nível gratuito. Nenhuma chave ou inferência autenticada foi usada. A chave deve ser configurada pelo usuário em `.env.local`; veja [docs/openai-gpt-6-luna.md](docs/openai-gpt-6-luna.md).
