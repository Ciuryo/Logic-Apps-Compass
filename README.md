# Logic Apps Compass

Central de aprendizagem e engenharia para Azure Logic Apps, em português brasileiro. Quatro jornadas: **Quero criar**, **Quero entender**, **Deu erro** e **Quero aprender**, com catálogo de templates e assistente contextual opcional.

## Iniciar localmente

Requisitos: Node.js 22 LTS (ou versão compatível com Next.js, mínimo 20.9) e npm. Ambiente usado: Node 22.22.3 / npm 10.9.8, Windows.

```powershell
npm ci
npm run dev
```

Abra [http://127.0.0.1:3000](http://127.0.0.1:3000). Não é necessária chave, subscription, autenticação ou conexão ao Azure. A aplicação funciona em modo local com `MockAiProvider` por padrão. O servidor escuta somente no endereço local.

Produção local:

```powershell
npm run build
npm start
```

## Stack e arquitetura

Next.js 16.4.0 App Router, React 19.3.0, TypeScript strict, Tailwind CSS 4, primitives acessíveis Radix, Lucide, React Flow, Zod, Vitest e Playwright. Componentes compartilhados seguem o padrão de composição de shadcn/ui, usando Radix diretamente. `package-lock.json` fixa a instalação com npm.

As análises determinísticas acontecem no navegador, com funções puras separadas da interface. Não há banco, login ou operações Azure. A rota de IA é server-side; valida consentimento e limites e repete a sanitização. O navegador armazena somente os IDs de aulas concluídas, nunca workflows ou erros. Veja [arquitetura](docs/architecture.md), [regras](docs/analysis-rules.md) e [privacidade](docs/privacy.md).

## Funcionalidades implementadas

- Upload, drag-and-drop, JSON colado, seis exemplos e limpeza da análise. Validação estrutural e original preservado.
- Parsing recursivo de triggers, actions, Scope, If/Condition, Foreach, Until, Switch/cases/default; tipos desconhecidos preservados; paths únicos; Run After com múltiplos status.
- Resumo, React Flow com zoom/pan/fit e tela cheia, detalhes de etapa, lista textual alternativa e JSON original.
- Regras locais com evidência segura, caminho, confiança, severidade textual, recomendação e fontes; filtros por categoria/natureza/severidade. Sem nota arbitrária.
- Doctor para JSON e texto, status HTTP, timeout, throttling, autenticação, autorização, expressão, Parse JSON, conexão, trigger, skipped action, connector, configuração e desconhecido.
- Sanitização de segredos e PII opcional; prévia revisável e envio explícito por solicitação.
- Seletor de IA com OpenRouter gratuito e NVIDIA Build para avaliação; demonstração local disponível sem chave.
- Wizard de 13 perguntas com proposta determinística, hosting qualificado, dúvidas, retry, segurança, monitoramento, idempotência e checklist.
- 18 documentos oficiais locais, 13 aulas com exercícios e respostas, progresso local e oito templates educacionais completos.
- Layout responsivo, menu móvel, sidebar recolhível, diálogo acessível do assistente, teclado, foco visível e redução de movimento.

## Variáveis de ambiente

Opcional: copie `.env.example` para `.env.local`. Nenhum segredo deve usar o prefixo `NEXT_PUBLIC_`. Reinicie o servidor depois de alterar as variáveis.

| Variável | Uso |
| --- | --- |
| `AI_PROVIDER` | Padrão do seletor: `mock`, `openrouter`, `nvidia`, `openai` ou `azure` |
| `OPENROUTER_API_KEY` | Chave OpenRouter, somente no servidor |
| `OPENROUTER_MODEL` | `openrouter/free` (padrão), ou ID completo terminado em `:free`; modelos pagos são recusados |
| `NVIDIA_API_KEY` | Chave NVIDIA Build, somente no servidor |
| `NVIDIA_MODEL` | `nvidia/nemotron-3-ultra-550b-a55b` (padrão), ou modelo disponível na conta |
| `OPENAI_API_KEY` | Chave do provedor, somente no servidor |
| `OPENAI_MODEL` | Modelo habilitado para Responses API na sua conta |
| `AZURE_OPENAI_API_KEY` | Chave do recurso Azure, somente no servidor |
| `AZURE_OPENAI_ENDPOINT` | URL base HTTPS do seu recurso, ou base terminada em `/openai/v1` |
| `AZURE_OPENAI_DEPLOYMENT` | Nome do deployment habilitado para Responses API |

OpenRouter e NVIDIA usam Chat Completions em endpoints fixos. OpenAI usa `/v1/responses`; Azure usa `/openai/v1/responses`. A API v1 do Azure não exige `api-version`. OpenAI/Azure exigem modelo/deployment configurado. Se selecionar um provedor real sem configurar os campos necessários, o painel informa o estado e bloqueia envio; a rota também retorna erro seguro. As ferramentas locais continuam funcionando.

Para ativar a IA gratuita, siga [o guia de OpenRouter/NVIDIA](docs/free-ai-providers.md). O OpenRouter usa somente modelos gratuitos e não faz fallback pago. O NVIDIA Build oferece acesso gratuito de desenvolvimento/avaliação, sujeito a limites e disponibilidade; não há promessa de acesso ilimitado ou gratuidade em produção. A troca de provedor exige nova prévia e autorização.

Os quatro provedores externos têm implementação real e testes de contrato HTTP com respostas controladas. **Autenticação e execução com contas reais não foram verificadas**, pois esta entrega não possui chaves e não realizou inferência externa. O Mock é identificado como demonstração e não faz alegações de análise por um modelo. O catálogo público indica apenas configuração local; não testa a chave nem a cota.

Referências verificadas: [OpenRouter Free](https://openrouter.ai/openrouter/free), [NVIDIA Nemotron 3 Ultra](https://build.nvidia.com/nvidia/nemotron-3-ultra-550b-a55b), [OpenAI Responses](https://platform.openai.com/docs/api-reference/responses) e [Azure Responses API](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/responses).

## Testes e verificações

```powershell
npx playwright install chromium
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
npm audit
```

Playwright inicia o servidor de desenvolvimento automaticamente quando não houver um disponível. Para verificação contra produção, execute o build e `npm start` antes de rodar os testes. No CI, a configuração inicia um servidor próprio. Relatório HTML: `playwright-report/index.html`; traces das falhas: `test-results/`. Testes de interface verificam upload, exemplos, paste, JSON inválido, grafo, detalhes, filtros, Doctor, privacidade, wizard, progresso, templates e seis larguras: 320, 360, 390, 768, 1024 e 1440 px.

O GitHub Actions roda lint, TypeScript, testes unitários/de integração, Playwright com Chromium e build em pushes para `main`, pull requests para `main` e execução manual. O fluxo usa Node.js 22, cache npm e permissões de leitura do repositório.

Resultado atualizado em 07/10/2026 após integração dos provedores gratuitos: lint, typecheck e build aprovados; **200 testes unitários/integração e 36 testes de interface passaram**, estes contra produção. Instalação limpa e audit com zero vulnerabilidades foram verificados na entrega inicial; nenhuma dependência mudou nesta atualização. [Registro de verificação](docs/verification.md), [revisão inicial](docs/review-report.md) e [revisão dos provedores gratuitos](docs/free-provider-review.md).

O lint usa ESLint, TypeScript, React Hooks e JSX a11y diretamente. Foi removida a configuração agregada do Next que introduzia uma dependência transitiva de desenvolvimento com advisory sem versão corrigida disponível; o código do Next e a stack da aplicação foram preservados.

## Estrutura principal

```text
src/app                  rotas e layout
src/components           estrutura e UI compartilhada
src/features             jornadas, visualização e assistente
src/lib/logic-apps        parser, graph, rules, explanations
src/lib/security          redaction
src/lib/diagnostics       classificação e investigação
src/lib/ai                contratos e providers
src/lib/architecture      propostas locais
src/content               conhecimento, aulas, templates e exemplos
src/types                 modelo normalizado
tests/unit                domínio e privacidade
tests/integration         rota de assistente
tests/e2e                 jornadas e responsividade
tests/fixtures            workflows e erros sintéticos
```

## Limitações reais

- Valida a estrutura inicial e analisa padrões; não implementa todo o schema WDL nem executa expressions, conectores ou workflows. O grafo mostra composição e dependências, sem simular execução.
- Em arquivos ARM com vários workflows, usa a primeira definição encontrada. Importação de projetos com vários arquivos está no backlog.
- Entrada até 2 MiB; parser representa até 1.500 etapas e 32 níveis. Ao limitar ou ignorar estruturas inválidas, indica análise parcial. Doctor e engine também têm limites de inspeção documentados.
- Assistente: pergunta até 6.000 caracteres, contexto até 100.000 caracteres, body até 350.000 bytes; timeout de 60 segundos para OpenRouter/NVIDIA e 20 segundos para OpenAI/Azure. Para workflows grandes, envie uma action selecionada ou omita o contexto.
- Redaction baseada em padrões pode não detectar todo dado confidencial; a prévia exige revisão humana. Nomes de recursos e regras de negócio também podem ser sensíveis.
- Fontes são curadas localmente com data de verificação. IA não faz pesquisa ao vivo e deve declarar informações não verificadas; URLs não curadas sugeridas pelo modelo são ocultadas.
- Templates de fila e arquivo simulam a entrada com Request; descrevem a substituição por trigger/conexão reais no designer. Nenhum template é um pacote implantável sem ajustes.
- Progresso é por navegador. Sem controle de acesso corporativo ou rate limit distribuído; avaliar ambos antes de expor o serviço a uma equipe pela rede.
- Testes de interface foram executados em Chromium. Outros browsers e auditoria com leitores de tela estão no backlog.

Itens planejados e exclusões do MVP estão em [docs/backlog.md](docs/backlog.md). Estado de execução em [PLANS.md](PLANS.md).
