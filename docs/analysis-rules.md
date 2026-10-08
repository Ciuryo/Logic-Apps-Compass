# Análise local de workflows

O parser, engine de regras, grafo e explicações são funções puras em `src/lib/logic-apps`. Não dependem de React, IA, rede ou Azure. A definição original e o texto enviado são preservados. Os achados não executam nem alteram o workflow.

## Contratos e entrada

- `parseWorkflow(input: string): ParsedWorkflow` aceita definição direta, `definition`, `properties.definition` e recursos em templates ARM, inclusive listas `resources` aninhadas. Em um arquivo com vários workflows, analisa a primeira definição encontrada; não combina workflows.
- `analyzeWorkflow(workflow: ParsedWorkflow): Finding[]` retorna observações e recomendações com caminho, evidência segura, confiança, explicação, recomendação e referência.
- `buildWorkflowGraph(workflow: ParsedWorkflow): WorkflowGraph` retorna nodes e edges para a interface.
- `explainAction(action: WorkflowAction): string` apresenta explicações iniciais e explicita os tipos desconhecidos.

`actions` inclui triggers, marcados com `isTrigger`; `summary.actionCount` exclui triggers. A definição e os objetos originais são disponibilizados para inspeção, mas nenhuma função os modifica. Os erros de sintaxe usam mensagens fixas em português e nunca reproduzem partes do payload.

O parser valida a forma estrutural inicial, e não todo o schema oficial da Workflow Definition Language. Não confirma implantabilidade, sintaxe completa de expressions, suporte de connectors, propriedades de cada action ou validade de credenciais.

## Limites explícitos

Entrada máxima: 2 MiB medidos em bytes UTF-8. O limite de tamanho rejeita a entrada antes de fazer parsing. Limite de representação: 1.500 etapas, incluindo triggers, e 32 níveis de containers. Ao exceder limites de representação, retorna `partial: true` e avisos, conservando o texto original e as etapas já identificadas. Actions malformadas são ignoradas com avisos e estado parcial; siblings válidos continuam disponíveis.

A inspeção de valores do engine limita cada trecho a 10.000 propriedades e 48 níveis. Se atingir o limite, produz um achado determinístico `inspection-limit`, sem afirmar que todos os valores foram revisados. Os limites são proteções locais da ferramenta; não representam limites de serviço do Azure.

## Recursão, identidade e dependências

São visitados `actions` de Scope, If/Condition, Foreach, Until e de tipos desconhecidos que possuam esse container; também `else.actions`, `cases.<nome>.actions` e `default.actions`. IDs são caminhos JSON completos, com notação entre colchetes para nomes que contenham pontos, aspas ou outros caracteres especiais. Nomes iguais em branches diferentes não colidem.

Quando `else`, `default` ou um case estiver presente, seu container precisa ser um objeto e declarar `actions` como objeto. Containers inválidos ou com `actions` ausente/inválido geram aviso com caminho exato e análise parcial; siblings válidos continuam disponíveis. `actions: {}` representa um branch explicitamente vazio e permanece válido. A ausência completa dos branches opcionais `else` ou `default` não torna a análise parcial. Essa validação estrutural local não substitui o schema completo Azure.

Run After é resolvido exclusivamente no conjunto de actions do mesmo bloco. Uma action do branch falso não ganha dependência de uma action com nome igual no branch verdadeiro. Referências inexistentes e autorreferências geram aviso e achado de dependência não resolvida. Status múltiplos são preservados, incluindo Succeeded, Failed, Skipped, TimedOut, Cancelled e Aborted; a preservação não afirma suporte de todos os status em todo contexto Azure. Status ausentes ou fora do catálogo local geram observação.

Edges de dependência representam Run After. Edges estruturais ligam triggers às entradas do workflow e containers às entradas de seus branches. Edges estruturais identificam composição, não modelam conclusão do container ou todas as semânticas de execução. O layout usa ordenação topológica e linhas sem sobreposição; a ferramenta não executa expressions nem simula loops. A lista de detalhes permanece uma alternativa textual ao grafo.

Hosting só é classificado com evidência de recurso: `Microsoft.Logic/workflows` indica Consumption; `Microsoft.Web/sites` acompanhado de `kind` contendo `workflowapp` indica Standard. Schema de definição, `kind: Stateful`, `kind: Stateless`, nome do workflow e propriedades de conectores não bastam. Definições isoladas exibem “Não foi possível determinar”.

## Interpretação dos achados

`deterministic` significa que uma configuração ou estrutura foi observada no JSON, com confiança alta. Isso não significa que uma credencial seja real ou que o workflow tenha falhado. `heuristic` significa sugestão contextual ou hipótese, com confiança média ou baixa. A interface deve mostrar recomendações e hipóteses como tais. Não existe pontuação de qualidade.

Todas as evidências usam caminhos e descrições de estrutura. Não incluem os valores originais de headers, bodies, tokens, connection strings, URLs, dados pessoais ou parâmetros. Repetição e equivalência podem comparar valores internamente, mas os valores não são copiados para o resultado. Campos originais exibidos em detalhes continuam a exigir o fluxo de sanitização e consentimento antes de qualquer envio à IA.

## Famílias implementadas

| Família | Regra e classificação | Limite de interpretação |
| --- | --- | --- |
| Segurança | `secret-literal`: Authorization, passwords, subscription keys, x-functions-key, client_secret, cookies, access/refresh tokens, API keys e connection strings literais. Determinístico. | Detecta o literal na configuração, não a validade do segredo. References `@parameters(...)` e interpolações não são interpretadas como literal completo. |
| Segurança | `token-header`, `embedded-token`, `connection-string`: nomes de headers, JWT, Bearer, JSON serializado e formatos de connection string. Heurístico. | Padrões de texto podem gerar falsos positivos e não cobrem todos os formatos. |
| Segurança | `insecure-http`: URL literal com HTTP. Determinístico. | Confirma a URL sem TLS, sem avaliar a rede real. |
| Segurança | `sensitive-url`: SAS/sig, token, code, key e credenciais em URL. Heurístico. | Nomes de parâmetros podem ter outro significado. URLs não são mostradas no achado. |
| Segurança/dados | `sensitive-data`: nomes de campos associados a dados pessoais em inputs e outputs. Heurístico. | Presença de dados reais e requisitos legais precisam de revisão humana. |
| Segurança | `secure-default`: parâmetro SecureString/SecureObject com defaultValue não vazio. Determinístico. | O tipo seguro não elimina um literal do arquivo local. |
| Segurança | `managed-identity`: destino parece Azure e não apresenta autenticação ManagedServiceIdentity. Hipótese de confiança baixa. | Hostnames só usam sufixos Azure reconhecidos com fronteira de domínio; suporte do serviço/connector/operação exige confirmação. |
| Confiabilidade | `http-retry`: HTTP sem retry policy explícita. Heurístico. | Não afirma ausência de retry: o runtime pode usar uma política padrão. |
| Confiabilidade | `failure-path`: operação externa sem caminho de falha identificável na action nem em seus containers. Heurístico. | A criticidade da action e tratamentos fora do JSON são desconhecidos. |
| Confiabilidade | `central-error`, `complex-without-scopes`: ausência de Scope ligado a falha, ou fluxo complexo sem organização por Scopes. Heurístico. | Try/Catch/Finally é uma proposta, não obrigação de todos os workflows. |
| Confiabilidade | `invalid-dependency-status`, `unresolved-dependency`: status vazio/desconhecido ou referência local ausente. Determinístico. | A ferramenta não valida todo o schema de execução Azure. |
| Confiabilidade | `fragile-dependency`: Skipped sem Succeeded no Run After. Heurístico. | Pode representar tratamento intencional. |
| Confiabilidade | `timeout-review`: sem limite explícito identificável em uma operação externa. Hipótese de confiança baixa. | Cada runtime/connector pode aplicar padrões próprios. |
| Performance | `loop-risk`: Until sem count/timeout explícitos, count acima de 100; Foreach com concorrência implícita ou acima de 20. Heurístico. | Os limiares são critérios locais de revisão, não limites oficiais ou falhas garantidas. |
| Performance | `response-chain`: Response depende de três ou mais operações externas no grafo de dependências. Heurístico. | Não estima duração e não expande todas as semânticas de containers. |
| Manutenibilidade | `generic-name`, `hardcoded-url`, `environment-value`: nomes genéricos, endpoint literal e configuração de ambiente embutida. Heurístico. | Configuração literal pode ser uma decisão válida. |
| Manutenibilidade | `deep-nesting`, `repeated-endpoint`, `duplicate-action`, `large-block`: profundidade acima de cinco, repetição de host/caminho, tipo e inputs equivalentes e grandes blocos. Heurístico. | Duplicação não implica remoção; branches e dependências podem justificar repetição. |
| Manutenibilidade | `unknown-type`: tipo fora do catálogo local. Determinístico informativo. | O tipo original e seus nested actions são preservados. |
| Observabilidade | `correlation-id`, `structured-error`, `diagnostic-context`: ausência de correlação explícita, caminho de falha ou contexto reconhecível. Hipóteses de confiança baixa. | Ausência no JSON não implica ausência de IDs do runtime, diagnostic settings ou monitoramento externo. |
| Observabilidade | `error-context`: Response com status de erro e body sem code/message/error/correlationId identificável. Heurístico. | Um contrato externo pode justificar outro formato. |

Alta complexidade usa mais de 15 actions ou profundidade acima de quatro. Bloco extenso usa mais de 15 actions diretas ou mais de 20 no workflow. Esses limiares apenas priorizam revisão.

## Exemplos e verificação

Seis exemplos educacionais locais: HTTP simples; Condition; Scope com Try/Catch/Finally; Foreach com Until aninhado; Switch com cases/default; workflow propositalmente problemático (`id: problematic`). Nenhum contém credencial real. Os exemplos necessitam adaptação de contratos, destinos, conexões e segurança antes de qualquer implantação; o problemático não deve ser implantado.

Fixtures correspondentes em `tests/fixtures/workflows` são verificadas contra os exemplos. Testes de comportamento cobrem formatos de entrada, identidade, recursão de todos os containers, branches, multistatus, tipos desconhecidos, erros seguros, limites, original imutável, grafo, evidências seguras, defaults seguros, headers, falhas de containers, respostas com cadeias externas e fronteiras de hostname Azure.

## Fontes oficiais verificadas em 06/10/2026

- [Schema da Workflow Definition Language](https://learn.microsoft.com/en-us/azure/logic-apps/workflow-definition-language-schema).
- [Tratamento de erros e exceções](https://learn.microsoft.com/en-us/azure/logic-apps/error-exception-handling).
- [Segurança de acesso e dados](https://learn.microsoft.com/en-us/azure/logic-apps/set-up-security-permissions).
- [Autenticação com Managed Identity](https://learn.microsoft.com/en-us/azure/logic-apps/authenticate-with-managed-identity).
- [Status e histórico de execuções](https://learn.microsoft.com/en-us/azure/logic-apps/view-workflow-status-run-history).

Estas fontes fundamentam os conceitos e recomendações. Não fazem parte da execução local do analyzer e não validam os limiares heurísticos particulares da ferramenta.
