import simple from "./simple.json";
import condition from "./condition.json";
import scopes from "./scopes.json";
import foreach from "./foreach.json";
import switchExample from "./switch.json";
import problematic from "./problematic.json";

export const workflowExamples = [
  { id: "simple", title: "HTTP Request e Response", description: "Exemplo educacional de entrada HTTP, Compose e resposta com correlação. Ajuste contratos e segurança antes de usar.", json: JSON.stringify(simple, null, 2) },
  { id: "condition", title: "Condition com dois caminhos", description: "Exemplo educacional de escolha por valor com nomes iguais em branches diferentes. Revise critérios e contratos.", json: JSON.stringify(condition, null, 2) },
  { id: "scopes", title: "Scope: Try, Catch e Finally", description: "Exemplo educacional de tratamento de falhas, retry e finalização. Configure um serviço real e proteja o diagnóstico.", json: JSON.stringify(scopes, null, 2) },
  { id: "foreach", title: "Foreach com Until aninhado", description: "Exemplo educacional de repetição por item e verificação de condição. O status é simulado por Compose; ajuste limites e lógica.", json: JSON.stringify(foreach, null, 2) },
  { id: "switch", title: "Switch por categoria", description: "Exemplo educacional de cases e default com actions identificadas por seu caminho. Ajuste os valores ao seu cenário.", json: JSON.stringify(switchExample, null, 2) },
  { id: "problematic", title: "Workflow com pontos de atenção", description: "Exemplo educacional propositalmente problemático, com valores fictícios, HTTP sem TLS e tratamento incompleto. Não implante.", json: JSON.stringify(problematic, null, 2) }
];
