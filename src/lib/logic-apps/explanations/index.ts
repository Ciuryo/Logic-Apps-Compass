import type { WorkflowAction } from "@/types/workflow";
const descriptions: Record<string, string> = {
  Request: "Inicia o workflow quando uma solicitação é recebida; o kind e os inputs definem o formato esperado.",
  Recurrence: "Inicia o workflow em uma agenda recorrente. Confira frequência, intervalo e fuso horário.",
  Http: "Envia uma chamada HTTP para outro sistema. Método, endereço, autenticação e retry determinam como a chamada funciona.",
  HttpWebhook: "Registra uma chamada HTTP e aguarda o retorno do sistema externo.",
  ApiConnection: "Executa uma operação de connector por uma conexão configurada. O comportamento depende do connector e da operação.",
  ApiConnectionWebhook: "Usa um connector para registrar uma assinatura e aguardar eventos.",
  ServiceProvider: "Executa uma operação de connector integrado ao runtime. Confira a conexão e a operação nos inputs.",
  Scope: "Agrupa etapas e oferece um status conjunto. Com Run After, pode compor processamento e tratamento de falhas.",
  If: "Avalia uma condição e segue o ramo verdadeiro ou falso.",
  Condition: "Avalia uma condição e segue o ramo verdadeiro ou falso.",
  Foreach: "Repete as etapas internas para cada item de uma coleção. Verifique a concorrência se houver dados compartilhados.",
  Until: "Repete as etapas internas até a condição ser satisfeita ou os limites de repetição e tempo serem alcançados.",
  Switch: "Compara um valor com os cases e segue o ramo correspondente; default cobre os demais valores.",
  Compose: "Produz um valor a partir dos inputs para reutilizar nas etapas seguintes.",
  ParseJson: "Valida e interpreta um JSON conforme um schema, permitindo acessar suas propriedades.",
  Response: "Devolve uma resposta para quem chamou o trigger HTTP. Revise status, headers e body.",
  Terminate: "Encerra esta execução com o status configurado. As etapas restantes não continuam.",
  Wait: "Pausa a execução por uma duração ou até um horário definido.",
  InitializeVariable: "Cria uma variável com nome, tipo e valor inicial.",
  SetVariable: "Atualiza o valor de uma variável existente. Atenção a alterações concorrentes em loops.",
  Select: "Transforma cada item de uma coleção no formato configurado.",
  Query: "Filtra os itens de uma coleção usando uma condição.",
  Join: "Combina itens de uma coleção em um texto com separador.",
  Table: "Transforma uma coleção em uma tabela no formato configurado.",
  Workflow: "Invoca outro workflow. Confira contrato de entrada, autenticação e comportamento em falhas.",
  Function: "Invoca uma Azure Function usando a conexão configurada.",
  JavaScriptCode: "Executa código JavaScript configurado na action. Revise entradas, saídas e limites do runtime."
};

export function explainAction(action: WorkflowAction): string {
  if (Object.hasOwn(descriptions, action.type)) return descriptions[action.type];
  return action.knownType ? `Etapa do tipo ${action.type}. Consulte os inputs e a documentação oficial para confirmar a operação.` : `Tipo de action desconhecido (Unknown action type): ${action.type}. O JSON foi preservado, mas o comportamento desta operação não foi validado.`;
}
