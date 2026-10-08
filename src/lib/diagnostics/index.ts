import type { DocumentationReference } from "@/types/workflow";
import { redactContent } from "@/lib/security/redaction";

export interface Diagnosis {
  summary: string;
  location: string;
  classification: string;
  evidence: { path: string; value: string }[];
  probableCauses: string[];
  investigationChecklist: string[];
  possibleFixes: string[];
  confidence: "high" | "medium" | "low";
  missingInformation: string[];
  documentationReferences: DocumentationReference[];
}
interface ErrorRule {
  classification: string;
  pattern: RegExp;
  priority: number;
  causes: string[];
  checks: string[];
  fixes: string[];
}
const reference: DocumentationReference = {
  title: "Diagnosticar falhas em Azure Logic Apps",
  url: "https://learn.microsoft.com/en-us/azure/logic-apps/logic-apps-diagnosing-failures",
  lastVerifiedAt: "2026-10-06",
};

const rules: ErrorRule[] = [
  { classification: "Parse JSON", pattern: /parse[ _-]?json|json.*(?:schema|validation|parse|invalid)|validationfailed|invalidjson|schemavalidation/i, priority: 100, causes: ["O body pode não corresponder ao schema ou pode conter JSON inválido."], checks: ["Compare o body real com o schema: tipos, propriedades obrigatórias e valores null.", "Confirme o Content-Type e se o body é objeto, array ou string."], fixes: ["Corrija o schema ou normalize o body antes de Parse JSON; teste campos ausentes e null."] },
  { classification: "Expressão inválida", pattern: /invalidtemplate|invalidexpression|template language|expressionevaluationfailed|unable to process.*express|express[aã]o inv[aá]lida|invalid expression/i, priority: 95, causes: ["Uma expressão pode acessar uma propriedade inexistente, ter sintaxe inválida ou receber um tipo diferente."], checks: ["Localize a expressão no input da action e confira os outputs da etapa referenciada.", "Verifique tipos, índices, valores null e nomes de actions."], fixes: ["Ajuste a expressão conforme o dado real; use navegação segura e coalesce quando apropriado."] },
  { classification: "Falha em configuração", pattern: /invalidworkflowconfiguration|invalidconfiguration|configurationerror|workflowvalidationfailed|invalidconnectionreference|missing.*(?:parameter|configuration)|configura[cç][aã]o.*(?:inv[aá]lid|falh)/i, priority: 90, causes: ["Uma configuração, parâmetro ou referência de conexão pode estar ausente ou incompatível."], checks: ["Valide referências de conexão, parâmetros e app settings no ambiente atual.", "Confira o erro de validação e a configuração suportada na documentação."], fixes: ["Corrija a referência ou configuração ausente e valide novamente antes de executar."] },
  { classification: "Throttling", pattern: /throttl|rate.?limit|too many requests|limite de (?:requisi[cç][oõ]es|chamadas)/i, priority: 72, causes: ["A taxa de chamadas pode ter excedido o limite do serviço ou connector."], checks: ["Confira Retry-After, tentativas e concorrência do loop.", "Verifique limites do serviço e se outras execuções usam a mesma conexão."], fixes: ["Reduza a concorrência e aplique retry com espera compatível com Retry-After."] },
  { classification: "Autenticação", pattern: /unauthenticated|unauthorized|invalidauthenticationtoken|authenticationfailed|invalid[_ ]?(?:client|token)|expired.*token|token.*expired|autentica[cç][aã]o/i, priority: 74, causes: ["A credencial pode estar ausente, expirada ou emitida para o recurso incorreto."], checks: ["Confira validade, audience e tenant da credencial sem divulgar o token.", "Revise a autenticação da conexão no Azure."], fixes: ["Renove a conexão ou ajuste a autenticação; prefira Managed Identity quando suportada."] },
  { classification: "Autorização", pattern: /authorizationfailed|accessdenied|forbidden|permission denied|insufficient.*(?:privilege|permission)|autoriza[cç][aã]o|permiss[aã]o negada/i, priority: 74, causes: ["A identidade pode não ter permissão; rede, firewall ou políticas também podem bloquear a chamada."], checks: ["Confira as permissões da identidade no recurso e o escopo da atribuição.", "Revise regras de rede e políticas de acesso."], fixes: ["Ajuste a permissão mínima necessária ou a regra de rede após confirmar a causa."] },
  { classification: "Timeout", pattern: /timeout|timed.?out|time.?limit|tempo limite|operationtimedout/i, priority: 73, causes: ["O serviço de destino pode estar lento ou a operação pode ter excedido o limite de duração."], checks: ["Compare duração da action, tempo de resposta do destino e tentativas.", "Confira os limites do workflow e do connector utilizado."], fixes: ["Investigue a latência; considere processamento assíncrono ou dividir a operação."] },
  { classification: "Conexão", pattern: /econnrefused|enotfound|econnreset|connection (?:refused|reset|failed)|dns|tls|certificate|unable to connect|connectionfailure|falha.*conex[aã]o/i, priority: 72, causes: ["DNS, TLS, firewall ou indisponibilidade do destino podem impedir a conexão."], checks: ["Confira endpoint, DNS, certificado e regras de rede.", "Teste a conectividade a partir do ambiente da Logic App."], fixes: ["Corrija o endpoint, certificado ou acesso de rede identificado na investigação."] },
  { classification: "Falha em connector", pattern: /connectoroperationfailed|connector.*(?:fail|error)|apiconnection.*(?:fail|error)|managedconnector|falha.*connector/i, priority: 68, causes: ["A operação ou conexão do connector pode falhar por parâmetros, disponibilidade ou credenciais."], checks: ["Abra os inputs e outputs da action e a conexão correspondente.", "Verifique o código interno retornado pelo serviço de destino."], fixes: ["Corrija os parâmetros ou renove a conexão conforme o erro interno; confirme os limites do connector."] },
  { classification: "Trigger não executado", pattern: /trigger.*(?:did not|not executed|not fire|never|disabled)|triggernotfired|trigger.*n[aã]o.*execut|gatilho.*n[aã]o/i, priority: 35, causes: ["O trigger pode estar desabilitado, sem evento elegível ou com condição não satisfeita."], checks: ["Confira Trigger History, estado do workflow e condições do trigger.", "Verifique frequência, timezone e se o evento foi entregue ao destino correto."], fixes: ["Habilite ou ajuste o trigger após confirmar condição, agenda e conexão."] },
  { classification: "Action ignorada", pattern: /skipped|actionbranchingconditionnotsatisfied|actiondependencyfailed|action.*ignored|action.*ignorada/i, priority: 25, causes: ["A condição de branch ou os status configurados em Run After podem não ter sido satisfeitos."], checks: ["Confira o status da etapa anterior e todos os status de Run After.", "Procure uma falha anterior: Skipped pode ser consequência esperada."], fixes: ["Ajuste Run After ou a condição apenas se a execução esperada estiver incorreta."] },
];

const httpGuidance: Record<number, { causes: string[]; checks: string[]; fixes: string[] }> = {
  400: { causes: ["O destino pode ter rejeitado campos, tipos ou formato da requisição."], checks: ["Compare inputs, headers e body com o contrato do destino."], fixes: ["Corrija os campos ou formato identificados no retorno do destino."] },
  401: { causes: ["A credencial pode estar ausente, inválida ou expirada."], checks: ["Confira autenticação, validade, audience e tenant sem expor o token."], fixes: ["Renove a credencial ou a conexão e valide a autenticação configurada."] },
  403: { causes: ["A identidade pode não ter permissão; políticas de rede também podem bloquear o acesso."], checks: ["Confira permissões, escopo de acesso, firewall e políticas do recurso."], fixes: ["Ajuste a permissão mínima necessária ou a regra de acesso após confirmar o bloqueio."] },
  404: { causes: ["O endpoint, recurso ou identificador solicitado pode não existir nesse ambiente."], checks: ["Confira URL, método, versão e identificador do recurso."], fixes: ["Corrija o endereço ou identificador e confirme o ambiente de destino."] },
  408: { causes: ["O destino não concluiu a requisição dentro do tempo esperado."], checks: ["Compare duração, tentativas e latência do destino."], fixes: ["Investigue a latência e considere retry somente se a operação puder ser repetida com segurança."] },
  409: { causes: ["A operação pode entrar em conflito com o estado atual do recurso ou uma execução concorrente."], checks: ["Confira o estado atual, duplicidade de eventos e operações concorrentes."], fixes: ["Trate idempotência ou controle de concorrência conforme o contrato do destino."] },
  429: { causes: ["O serviço ou connector limitou a taxa de chamadas."], checks: ["Confira Retry-After e a concorrência das execuções e loops."], fixes: ["Reduza a concorrência e aplique espera e retry compatíveis com o limite do destino."] },
  500: { causes: ["O destino reportou falha interna; o código isolado não confirma a causa."], checks: ["Leia o erro interno e correlacione a execução com os logs do destino.", "Confira disponibilidade, tentativas e duração do serviço."], fixes: ["Trate a falha com Scope e retry quando seguro; investigue o serviço antes de alterar o workflow."] },
};

interface Signal { path: string; key: string; value: string; depth: number; executionStatus?: string; executionPath?: string }
interface Candidate { classification: string; priority: number; signal: Signal; rule?: ErrorRule; status?: number }
const observedProperty = /^(status|statusCode|code|message|error|innerError|body|outputs|headers|retryAfter|retry-after|clientTrackingId|correlationId|actionName|name)$/i;
const codeStatuses: Record<string, number> = { badrequest: 400, unauthorized: 401, forbidden: 403, notfound: 404, requesttimeout: 408, conflict: 409, toomanyrequests: 429, internalservererror: 500, badgateway: 502, serviceunavailable: 503, gatewaytimeout: 504 };

export function diagnoseError(input: string): Diagnosis {
  const safeInput = redactContent(input).content;
  const signals: Signal[] = [];
  let truncated = false;
  function collect(value: unknown, path: string, key: string, depth: number, executionStatus?: string, executionPath?: string): void {
    if (depth > 50 || signals.length >= 1000) { truncated = true; return; }
    if (Array.isArray(value)) { value.forEach((item: unknown, index) => collect(item, `${path}[${index}]`, key, depth + 1, executionStatus, executionPath)); return; }
    if (value !== null && typeof value === "object") {
      const record = value as Record<string, unknown>;
      const localStatus = typeof record.status === "string" && /^(Failed|TimedOut|Succeeded|Skipped|Cancelled|Aborted)$/i.test(record.status) ? record.status : undefined;
      const localPath = localStatus ? path : executionPath;
      for (const [childKey, childValue] of Object.entries(value)) collect(childValue, `${path}.${childKey}`, childKey, depth + 1, localStatus ?? executionStatus, localPath);
      return;
    }
    if (value === null || value === undefined) return;
    const text = String(value);
    const trimmed = text.trimStart();
    if (typeof value === "string" && (trimmed.startsWith("{") || trimmed.startsWith("["))) {
      try { collect(JSON.parse(text) as unknown, path, key, depth + 1, executionStatus, executionPath); return; } catch { /* Body textual também contém sinais úteis. */ }
    }
    signals.push({ path, key, value: text.slice(0, 4000), depth, executionStatus, executionPath });
  }
  try { collect(JSON.parse(safeInput) as unknown, "$", "", 0); } catch { collect(safeInput, "$", "message", 0); }
  const candidates: Candidate[] = [];
  for (const signal of signals) {
    if (/^(actionName|name|clientTrackingId|correlationId|retryAfter|retry-after)$/i.test(signal.key)) continue;
    if (/^code$/i.test(signal.key)) {
      const status = codeStatuses[signal.value.toLowerCase()];
      if (status) candidates.push({ classification: status >= 500 ? "HTTP 5xx" : `HTTP ${status}`, priority: status >= 500 ? 60 : 85, signal, status });
    }
    if (/^(statusCode|status|code)$/i.test(signal.key) && /^\d{3}$/.test(signal.value)) {
      const status = Number(signal.value);
      if (status >= 400 && (status in httpGuidance || status >= 500 && status <= 599)) candidates.push({ classification: status >= 500 ? "HTTP 5xx" : `HTTP ${status}`, priority: status >= 500 ? 60 : 85, signal, status });
    }
    for (const match of signal.value.matchAll(/\b(?:HTTP(?:\/\d(?:\.\d)?)?\s*[:=]?\s*|status(?:\s*code)?\s*[:=]?\s*)([45]\d{2})\b/gi)) {
      const status = Number(match[1]);
      if (status in httpGuidance || status >= 500 && status <= 599) candidates.push({ classification: status >= 500 ? "HTTP 5xx" : `HTTP ${status}`, priority: status >= 500 ? 60 : 85, signal, status });
    }
    for (const rule of rules) if (rule.pattern.test(signal.value)) candidates.push({ classification: rule.classification, priority: rule.priority, signal, rule });
  }
  function executionPriority(signal: Signal): number {
    const output = /\.outputs\b|\.error\b|\.innerError\b/.test(signal.path);
    const input = /\.inputs\b/.test(signal.path);
    if (/^(Succeeded|Skipped)$/i.test(signal.executionStatus ?? "")) return -300;
    if (/^(Failed|TimedOut|Aborted)$/i.test(signal.executionStatus ?? "")) return output ? 300 : input ? 80 : 180;
    return output ? 100 : input ? -50 : 0;
  }
  candidates.sort((left, right) => executionPriority(right.signal) - executionPriority(left.signal) || right.priority - left.priority || right.signal.depth - left.signal.depth);
  const strongest = candidates[0];
  const explicitAction = signals.find((signal) => /^actionName$/i.test(signal.key));
  const scopePath = strongest?.signal.executionPath ?? strongest?.signal.path.replace(/\.(outputs|inputs|body|error|innerError|headers)(?:\.|$).*/, "") ?? "$";
  const localAction = signals.find((signal) => /^actionName$/i.test(signal.key) && signal.path.startsWith(scopePath));
  const action = localAction ?? explicitAction;
  const location = action ? `Action ${action.value}` : strongest?.signal.path !== "$" && strongest ? strongest.signal.path : "Não foi possível determinar a action; consulte Run History.";
  const guidance = strongest?.rule ?? (strongest?.status ? httpGuidance[strongest.status >= 500 ? 500 : strongest.status] : undefined);
  const evidenceSignals = signals.filter((signal) => observedProperty.test(signal.key) || signal === strongest?.signal);
  const missingInformation: string[] = [];
  const competingFailures = new Set(candidates.filter((candidate) => /^(Failed|TimedOut|Aborted)$/i.test(candidate.signal.executionStatus ?? "") && candidate.signal.executionPath !== strongest?.signal.executionPath).map((candidate) => candidate.signal.executionPath));
  const ambiguous = competingFailures.size > 0;
  if (ambiguous) missingInformation.push("Há falhas em mais de uma action. Informe a ordem de execução e a primeira falha para confirmar a causa principal.");
  if (!signals.some((signal) => /^(status|statusCode)$/i.test(signal.key) && /\d{3}|failed|timedout|skipped/i.test(signal.value)) && !strongest?.status) missingInformation.push("Status e status code da action no Run History.");
  if (!action && !/\.actions\./.test(strongest?.signal.path ?? "")) missingInformation.push("Nome da action ou trigger que falhou.");
  if (!signals.some((signal) => /\.inputs\b|\.outputs\b/.test(signal.path))) missingInformation.push("Inputs e outputs relevantes, com credenciais e dados pessoais ocultados.");
  if (!signals.some((signal) => /clientTrackingId|correlationId/i.test(signal.key))) missingInformation.push("Correlation ID e horário da execução para consultar os logs do destino.");
  if (truncated) missingInformation.push("Entrada resumida: a análise atingiu o limite de 50 níveis ou 1.000 valores.");
  return {
    summary: strongest ? `${strongest.classification}: ${guidance?.causes[0] ?? "Há sinais de falha; confirme a causa no Run History."}` : "Não há evidência suficiente para identificar a falha. Envie o erro completo sanitizado do Run History.",
    location,
    classification: strongest?.classification ?? "Falha desconhecida",
    evidence: evidenceSignals.slice(0, 30).map(({ path, value }) => ({ path, value: redactContent(value).content.slice(0, 1200) })),
    probableCauses: guidance?.causes ?? ["Os dados atuais não permitem distinguir falha de entrada, conexão, configuração ou serviço."],
    investigationChecklist: ["Abra a execução no Run History e localize a primeira action com falha.", ...(guidance?.checks ?? ["Cole o código e a mensagem completa da falha, incluindo o erro interno."]), "Compare os inputs e outputs sanitizados; uma hipótese precisa ser confirmada pelos dados."],
    possibleFixes: guidance?.fixes ?? ["Colete as evidências antes de alterar o workflow ou repetir uma operação com efeitos externos."],
    confidence: !strongest ? "low" : ambiguous || /^(Succeeded|Skipped)$/i.test(strongest.signal.executionStatus ?? "") || /\.inputs\b/.test(strongest.signal.path) ? "medium" : strongest.status || /^code$/i.test(strongest.signal.key) ? "high" : "medium",
    missingInformation,
    documentationReferences: [reference],
  };
}

export const errorExamples: { id: string; title: string; input: string }[] = [
  { id: "http-400", title: "HTTP 400 · body inválido", input: JSON.stringify({ actionName: "Criar_pedido", outputs: { statusCode: 400, body: { error: { code: "BadRequest", message: "O campo customerId é obrigatório." } } } }, null, 2) },
  { id: "http-401", title: "HTTP 401 · autenticação", input: JSON.stringify({ actionName: "Consultar_api", outputs: { statusCode: 401, body: { error: { code: "Unauthorized", message: "A credencial expirou." } } } }, null, 2) },
  { id: "http-403", title: "HTTP 403 · permissão", input: JSON.stringify({ actionName: "Ler_blob", outputs: { statusCode: 403, body: { code: "AuthorizationFailed", message: "A identidade não possui permissão de leitura." } } }, null, 2) },
  { id: "http-429", title: "HTTP 429 · limite de chamadas", input: JSON.stringify({ actionName: "Consultar_servico", outputs: { statusCode: 429, headers: { "Retry-After": "30" }, body: { code: "TooManyRequests", message: "Limite de requisições excedido." } } }, null, 2) },
  { id: "http-500", title: "HTTP 500 · falha no destino", input: JSON.stringify({ actionName: "Enviar_pedido", outputs: { statusCode: 500, body: { error: { code: "InternalServerError", message: "O serviço não concluiu a operação." } } } }, null, 2) },
  { id: "expression", title: "Expressão inválida", input: JSON.stringify({ actionName: "Ler_nome", error: { code: "InvalidTemplate", message: "Unable to process template language expressions: property 'name' cannot be selected from null." } }, null, 2) },
  { id: "parse-json", title: "Parse JSON · schema incompatível", input: JSON.stringify({ actionName: "Parse_JSON", error: { code: "ValidationFailed", message: "Parse JSON failed: expected Integer but got String.", innerError: { path: "$.quantity" } } }, null, 2) },
];
