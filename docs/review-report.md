# Revisão independente — Logic Apps Compass

Revisão em 06/10/2026, por leitura direta do repositório, pedido integral anexado, AGENTS.md, PLANS.md e especificação. Não houve edição de implementação, uso de provedores externos ou abertura de outro servidor. Este relatório é a única gravação da revisão.

## Vereditos após correções

Revisão de retorno concluída sobre a integração atual. **R1–R4 estão corrigidos e verificados. Não há achado bloqueador aberto nesta revisão.**

- **Task 1 — domínio: aprovada no escopo revisado.** Branches malformados agora produzem avisos com caminho exato e estado parcial, preservando etapas válidas. Recursão, identidades por caminho, runAfter local ao branch e original preservado mantêm a cobertura anterior.
- **Task 2 — privacidade/IA/Doctor: aprovada no escopo revisado.** Os dois vazamentos reproduzidos foram corrigidos; uma e duas passagens não preservam os segredos. Doctor prioriza a falha estruturada real e reduz confiança quando ações distintas trazem falhas concorrentes. Sanitização continua baseada em padrões e exige revisão humana da prévia, conforme README.
- **Task 3 — conteúdo/wizard: aprovada no escopo revisado.** Conteúdo concreto, incerteza das propostas e natureza educacional/simulada dos templates estão documentados. A revisão não repetiu a verificação online de fontes feita pelo implementador.
- **Task 4 — interface: aprovada no escopo revisado.** A associação de findings agora respeita a fronteira dos caminhos. O integrador informou 23/23 E2E aprovados nas seis larguras e inspeção de capturas desktop/mobile; estes testes não foram repetidos por este revisor. A revisão independente confirmou o predicado corrigido com nomes de prefixo comum e caminhos entre colchetes.
- **Conjunto: aprovado quanto aos achados da revisão, sujeito aos checks finais da entrega.** `npm test` executado novamente pelo revisor: **9 arquivos, 135 testes, todos aprovados**. Não foi identificado novo defeito crítico concreto nos trechos alterados. Lint, typecheck, build e atualização final de PLANS.md ficam com o integrador.

README agora registra limitações reais, incluindo provedores externos não exercitados com contas reais, parser sem execução completa de WDL, limites de entrada, Chromium como navegador testado e autenticação corporativa fora do MVP. Essas limitações não são apresentadas como funções completas.

## Achados resolvidos — registro da revisão inicial

Os textos abaixo preservam as reproduções e causas originais para rastreabilidade; **não descrevem defeitos ainda presentes**.


### R1 — Corrigido — P1 original — Segredos sobrevivem à sanitização de headers e connection strings em texto

**Arquivo:** `src/lib/security/redaction.ts:50` e `:52`.

Reprodução executada diretamente sobre a função:

- Entrada `Cookie: session="secretpart"; other=moresecret` → saída `Cookie: [OCULTO]"secretpart"; other=moresecret`.
- Entrada `Server=test;Password=alpha beta;Database=test` → saída `Server=test;Password=[OCULTO] beta;Database=test`.

O regex de header interrompe na aspa, preservando o valor real e os cookies seguintes. O regex de credencial simples interrompe no espaço, embora senhas de connection strings possam contê-lo. O mesmo sanitizador é usado na prévia e no servidor; uma segunda passagem não elimina esses resíduos. Assim, o envio explicitamente autorizado da prévia pode levar esses segredos ao provedor, contrariando a sanitização exigida.

**Correção:** tratar o valor completo de headers textuais e os delimitadores próprios de connection strings, preservando a sanitização segura de JSON/JSON escapado. Adicionar regressões que comprovem ausência de todos os fragmentos dos segredos após uma e duas passagens, inclusive cookies citados e múltiplos cookies.

### R2 — Corrigido — P2 original — Doctor prioriza texto de input bem-sucedido sobre a falha estruturada real

**Arquivo:** `src/lib/diagnostics/index.ts:80`, `:96` e `:119`.

Reprodução executada:

```json
{"actions":{"Fine":{"status":"Succeeded","inputs":{"message":"HTTP 401 Unauthorized is an example"}},"Bad":{"status":"Failed","outputs":{"statusCode":500}}}}
```

Resultado atual: `HTTP 401`, localização `$.actions.Fine.inputs.message`, confiança `high`. O erro efetivo está em `Bad.outputs.statusCode` e é 500. Todos os textos entram como candidatos equivalentes e o ranking fixo favorece 401 a 500 sem considerar origem (input/output) ou status da action.

**Correção:** priorizar evidência de saída/erro de actions que falharam; não deixar texto incidental em inputs de actions bem-sucedidas substituir essa evidência. Quando houver múltiplas falhas sem ordem causal demonstrável, declarar ambiguidade em vez de escolher com confiança alta. Incluir regressão para o caso acima.

### R3 — Corrigido — P2 original — Branches malformados são descartados sem estado parcial

**Arquivo:** `src/lib/logic-apps/parser/index.ts:79` e `:85`.

Reproduções: `{"triggers":{},"actions":{"Test":{"type":"If","actions":{},"else":[]}}}` e um Switch com `"default":"invalid"`. Ambos retornam `partial:false` e `warnings:[]`. A interface anuncia análise concluída mesmo com um branch presente que o parser ignorou. Há validação explícita para `actions` e `cases`, mas não para `else`/`default`.

**Correção:** quando esses campos estiverem presentes e não forem objetos, emitir aviso com caminho exato e marcar análise parcial, preservando as etapas válidas. Testar `else` e `default` com array/string/null.

### R4 — Corrigido — P2 original — Detalhes associam findings de actions diferentes que compartilham prefixo

**Arquivo:** `src/features/workflow-visualizer/index.tsx:38`.

A associação usa `finding.workflowPath?.startsWith(action.path)`. Um achado de `$.actions.Call2.inputs.uri` aparece ao selecionar `$.actions.Call`, embora sejam actions irmãs. Esse achado também entra no contexto preparado pelo botão de pergunta sobre a action. O caso é comum com nomes como `HTTP` e `HTTP_2`.

**Correção:** comparar o caminho completo ou um descendente separado por `.`/`[`, ou associar por identidade explícita da action. Manter os achados de descendentes verdadeiros se esse for o comportamento desejado para containers. Testar `Call`/`Call2` e nomes com notação entre colchetes.

## Evidência de verificação inicial

Executado nesta revisão:

`npm test -- tests/unit/workflow.test.ts tests/unit/redaction.test.ts tests/unit/diagnostics.test.ts tests/unit/content.test.ts tests/unit/architecture.test.ts tests/integration/assistant.test.ts`

Resultado: **6 arquivos e 97 testes passaram**. As reproduções R1–R3 foram executadas por carregamento/transpilação em memória das funções existentes, sem arquivos de teste temporários; R4 foi confirmado pela comparação direta de caminhos no código. Os testes existentes não cobrem esses contraexemplos.

Build, lint, typecheck, E2E e inspeção visual completos continuam sob responsabilidade do integrador; não se presume aprovação por esta revisão. PLANS.md estava com tarefas abertas durante a inspeção e deve ser atualizado com o resultado real ao entregar.

## Evidência da revisão de retorno

- `npm test`: **9 arquivos e 135 testes passaram**; execução independente em 06/10/2026 às 23:48 no ambiente local.
- R1: `Cookie: session="secretpart"; other=moresecret` resulta em `Cookie: [OCULTO]`; `Server=test;Password=alpha beta;Database=test` resulta em `Server=test;Password=[OCULTO];Database=test`. Confirmada ausência dos fragmentos de segredo após duas passagens.
- R2: o contraexemplo original agora resulta em `HTTP 5xx`, localização `$.actions.Bad.outputs.statusCode`. Testes adicionados cobrem falhas concorrentes e confiança reduzida.
- R3: `else: []` e `default: "invalid"` retornam estado parcial e aviso de container inválido no caminho correspondente; regressões também cobrem conteúdo ausente/malformado e branches vazios válidos.
- R4: leitura do predicado atual e execução em memória confirmaram exclusão de `Call2` ao selecionar `Call`, inclusão de descendentes reais e comportamento correto de caminhos com nomes entre colchetes.

As verificações diretas usaram funções transpiladas em memória, sem modificar implementação ou criar testes temporários. Nenhum provedor externo foi consultado. A validação de layout/E2E de 23 testes foi informada pelo integrador, distinguida aqui da execução unitária independente.

## Adendo final — fontes curadas no assistente

Revisão limitada de `src/lib/ai/sources.ts`, `providers.ts`, `mock-provider.ts` e testes associados, em 06/10/2026 às 23:54. **Aprovada: nenhum vazamento, alegação nova de verificação ou regressão concreta de provider identificados nessa mudança.**

Os resumos acrescentados às instruções são conteúdo público local curado, não payloads adicionais do usuário. O filtro de documentos exige marca oficial, data, ausência de pendência e HTTPS no domínio exato Microsoft Learn, sem credenciais na URL. As referências do Doctor incluídas no catálogo atual também têm URL oficial e data. A deduplicação é por URL; respostas reais retornam apenas as URLs curadas encontradas na resposta. O Mock continua identificado como demonstração e seleciona referências pertinentes ao modo. Consentimento, sanitização, timeout, endpoint e armazenamento desabilitado permanecem no caminho real.

Execução independente: `npm test -- tests/unit/ai.test.ts tests/integration/assistant.test.ts` — **2 arquivos e 20 testes passaram**, com chamadas HTTP simuladas. Não houve consulta externa ou validação com contas reais. O catálogo registra a verificação histórica de fontes; isso não verifica automaticamente cada afirmação produzida pelo modelo, e as instruções orientam declarar afirmações não sustentadas como pendentes.
