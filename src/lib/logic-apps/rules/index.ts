import type { DocumentationReference, Finding, JsonObject, JsonValue, ParsedWorkflow, WorkflowAction } from "@/types/workflow";
import { appendJsonPath, isJsonObject } from "@/lib/logic-apps/parser";

const references: Record<string, DocumentationReference> = {
  schema: { title: "Estrutura da Workflow Definition Language", url: "https://learn.microsoft.com/en-us/azure/logic-apps/workflow-definition-language-schema", lastVerifiedAt: "2026-10-06" },
  errors: { title: "Tratamento de erros e exceções", url: "https://learn.microsoft.com/en-us/azure/logic-apps/error-exception-handling", lastVerifiedAt: "2026-10-06" },
  security: { title: "Segurança e proteção de dados", url: "https://learn.microsoft.com/en-us/azure/logic-apps/set-up-security-permissions", lastVerifiedAt: "2026-10-06" },
  identity: { title: "Autenticação com Managed Identity", url: "https://learn.microsoft.com/en-us/azure/logic-apps/authenticate-with-managed-identity", lastVerifiedAt: "2026-10-06" },
  monitoring: { title: "Status e histórico de execuções", url: "https://learn.microsoft.com/en-us/azure/logic-apps/view-workflow-status-run-history", lastVerifiedAt: "2026-10-06" }
};

interface Leaf { key: string; path: string; value: JsonValue }
const secretKey = /^(authorization|proxy-authorization|cookie|set-cookie|ocp-apim-subscription-key|x-functions-key|client[_-]?secret|password|pwd|secret|access[_-]?token|refresh[_-]?token|api[_-]?key|connection[_-]?string|sharedaccesssignature|accountkey|token)$/i;
const sensitiveKey = /^(cpf|cnpj|email|phone|telefone|ssn|creditcard|cardnumber|birthdate|medicalrecord)$/i;
const environmentKey = /^(environment|tenantid|subscriptionid|resourcegroup|hostname|baseurl|servername|databasename)$/i;
const failureStatuses = new Set(["Failed", "TimedOut", "Cancelled", "Aborted"]);
const statuses = new Set(["Succeeded", "Failed", "Skipped", "TimedOut", "Cancelled", "Aborted"]);
const externalTypes = new Set(["Http", "HttpWebhook", "ApiConnection", "ApiConnectionWebhook", "ServiceProvider", "Function", "Workflow"]);

function hasDynamicReference(value: string): boolean {
  return /^@(?!@)/.test(value.trim()) || /@\{[^}]+\}/.test(value);
}

function collectLeaves(value: JsonValue | undefined, path: string): { leaves: Leaf[]; truncated: boolean } {
  if (value === undefined) return { leaves: [], truncated: false };
  const stack = [{ value, path, key: "", depth: 0 }];
  const leaves: Leaf[] = [];
  let visited = 0;
  let truncated = false;
  while (stack.length) {
    const entry = stack.pop()!;
    if (++visited > 10000) { truncated = true; break; }
    if (entry.depth > 48) { truncated = true; continue; }
    if (Array.isArray(entry.value)) entry.value.forEach((item, index) => stack.push({ value: item, path: `${entry.path}[${index}]`, key: entry.key, depth: entry.depth + 1 }));
    else if (isJsonObject(entry.value)) for (const [key, item] of Object.entries(entry.value)) stack.push({ value: item, path: appendJsonPath(entry.path, key), key, depth: entry.depth + 1 });
    else leaves.push({ key: entry.key, path: entry.path, value: entry.value });
  }
  return { leaves, truncated };
}

function urlValue(value: string): URL | undefined {
  if (!/^https?:\/\//i.test(value) || hasDynamicReference(value)) return;
  try { return new URL(value); } catch { return; }
}

function isAzureHost(host: string): boolean {
  return ["azurewebsites.net", "vault.azure.net", "blob.core.windows.net", "queue.core.windows.net", "servicebus.windows.net", "management.azure.com", "database.windows.net"].some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

function actionHasFailurePath(action: WorkflowAction, workflow: ParsedWorkflow): boolean {
  let source: WorkflowAction | undefined = action;
  const byId = new Map(workflow.actions.map((entry) => [entry.id, entry]));
  while (source) {
    const sourceId = source.id;
    if (workflow.dependencies.some((dependency) => dependency.source === sourceId && !dependency.structural && dependency.statuses.some((status) => failureStatuses.has(status)))) return true;
    source = source.parentId ? byId.get(source.parentId) : undefined;
  }
  return false;
}

interface FindingSpec {
  code: string; title: string; description: string; category: Finding["category"];
  path: string; recommendation: string; why: string; action?: WorkflowAction;
  deterministic?: boolean; critical?: boolean; severity?: Finding["severity"]; source?: string; evidence?: string; lowConfidence?: boolean;
}

export function analyzeWorkflow(workflow: ParsedWorkflow): Finding[] {
  const findings: Finding[] = [];
  const ids = new Set<string>();
  const add = (spec: FindingSpec) => {
    const id = `${spec.code}:${spec.path}`;
    if (ids.has(id)) return;
    ids.add(id);
    findings.push({ id, title: spec.title, description: spec.description, type: spec.deterministic ? "deterministic" : "heuristic", severity: spec.severity ?? (spec.critical ? "critical" : "warning"), category: spec.category, workflowPath: spec.path, ...(spec.action ? { actionName: spec.action.name } : {}), evidence: spec.evidence ?? `Propriedade ou estrutura identificada em ${spec.path}. Valores omitidos para proteger dados.`, whyItMatters: spec.why, recommendation: spec.recommendation, confidence: spec.deterministic ? "high" : spec.lowConfidence ? "low" : "medium", documentationReferences: [references[spec.source ?? "schema"]] });
  };
  const inspectLeaves = (value: JsonValue | undefined, path: string, action?: WorkflowAction) => {
    const result = collectLeaves(value, path);
    if (result.truncated) add({ code: "inspection-limit", title: "Inspeção de valores limitada", description: "Uma estrutura de dados ultrapassou os limites de profundidade ou quantidade da inspeção de valores.", category: "data", path, action, deterministic: true, recommendation: "Revise manualmente os inputs e outputs deste trecho.", why: "Parte dos valores não foi inspecionada pelas regras locais.", evidence: "Limite local: 48 níveis ou 10.000 propriedades por trecho." });
    for (const leaf of result.leaves) {
      const literal = leaf.value !== null && (typeof leaf.value !== "string" || Boolean(leaf.value.trim()) && !hasDynamicReference(leaf.value));
      if (literal && secretKey.test(leaf.key)) add({ code: "secret-literal", title: "Valor sensível literal na definição", description: "Um campo normalmente usado para autenticação contém um valor literal. Isso confirma a configuração embutida, mas não prova que seja uma credencial válida.", category: "security", path: leaf.path, action, deterministic: true, critical: true, recommendation: "Substitua o literal por referência segura a parâmetro, app setting ou Key Vault; considere rotacionar uma credencial real exposta.", why: "Definições compartilhadas podem revelar credenciais e permitir acesso indevido.", source: "security" });
      if (literal && !secretKey.test(leaf.key) && /\.headers(?:\.|\[)/.test(leaf.path) && /token|api[-_]?key|subscription[-_]?key/i.test(leaf.key)) add({ code: "token-header", title: "Header pode conter token ou chave", description: "O nome de um header sugere autenticação e seu valor é literal. Revise o significado deste header.", category: "security", path: leaf.path, action, critical: true, recommendation: "Confirme se é uma credencial e use uma referência segura quando aplicável.", why: "Chaves podem usar nomes de headers próprios do sistema externo.", source: "security" });
      if (literal && /(?:AccountKey|SharedAccessKey|Password|Pwd)\s*=\s*[^;\s]+/i.test(String(leaf.value))) add({ code: "connection-string", title: "Possível connection string com segredo", description: "O formato do texto sugere uma connection string com chave ou senha literal.", category: "security", path: leaf.path, action, critical: true, recommendation: "Use referência segura e revise a exposição desta conexão.", why: "Uma connection string pode conceder acesso ao sistema inteiro.", source: "security" });
      if (literal && /(?:\bBearer\s+[A-Za-z0-9._~-]+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|["'](?:client_secret|password|access_token|api_key)["']\s*:\s*["'][^"']+)/i.test(String(leaf.value)) && !secretKey.test(leaf.key)) add({ code: "embedded-token", title: "Possível token dentro de um texto", description: "Um texto contém um padrão compatível com token ou segredo; revise antes de compartilhar.", category: "security", path: leaf.path, action, critical: true, recommendation: "Remova o valor sensível do texto e use uma referência segura.", why: "Segredos também podem estar dentro de JSON serializado ou mensagens.", source: "security", lowConfidence: true });
      if (sensitiveKey.test(leaf.key)) add({ code: "sensitive-data", title: "Possíveis dados pessoais em inputs ou outputs", description: "O nome de uma propriedade indica possível informação pessoal. A presença de dados reais precisa ser confirmada.", category: "data", path: leaf.path, action, recommendation: "Revise necessidade, retenção e proteção de inputs e outputs no Run History.", why: "Dados pessoais podem ficar visíveis para quem consulta o histórico.", source: "security", lowConfidence: true });
      if (literal && environmentKey.test(leaf.key)) add({ code: "environment-value", title: "Valor específico de ambiente embutido", description: "Um campo associado a ambiente possui um valor literal.", category: "maintainability", path: leaf.path, action, recommendation: "Considere parameters ou app settings para variar o valor entre ambientes.", why: "Valores embutidos aumentam o risco de chamar o ambiente errado." });
      if (typeof leaf.value !== "string") continue;
      const url = urlValue(leaf.value);
      if (!url) continue;
      if (url.protocol === "http:") add({ code: "insecure-http", title: "URL configurada sem HTTPS", description: "Foi encontrada uma URL com esquema HTTP, sem proteção TLS.", category: "security", path: leaf.path, action, deterministic: true, recommendation: "Utilize HTTPS e valide o certificado do destino.", why: "Dados em trânsito podem ser interceptados ou alterados.", source: "security" });
      const sensitiveQuery = [...url.searchParams.keys()].some((key) => /^(sig|signature|token|access_token|code|key|api[-_]?key|password|secret|client_secret)$/i.test(key));
      if (sensitiveQuery || url.username || url.password) add({ code: "sensitive-url", title: "URL com parâmetros potencialmente sensíveis", description: "A URL contém nomes de parâmetros usados para assinaturas ou autenticação, ou credenciais na própria URL.", category: "security", path: leaf.path, action, recommendation: "Use autenticação apropriada, proteja assinaturas SAS e evite segredos em URLs e logs.", why: "URLs podem aparecer em histórico, proxies e registros de diagnóstico.", source: "security" });
      if (["uri", "url", "baseurl"].includes(leaf.key.toLowerCase())) add({ code: "hardcoded-url", title: "Endpoint literal merece revisão", description: "O endereço do destino está embutido na definição. Isso pode ser aceitável, mas exige revisão para promoção entre ambientes.", category: "maintainability", path: leaf.path, action, severity: "info", recommendation: "Considere configurar o endpoint por parameters ou app settings.", why: "Separar configuração reduz mudanças de código entre ambientes." });
    }
    return result.leaves;
  };

  const runtimeActions = workflow.actions.filter((action) => !action.isTrigger);
  const byId = new Map(workflow.actions.map((action) => [action.id, action]));
  const endpointActions = new Map<string, WorkflowAction[]>();
  const fingerprints = new Map<string, WorkflowAction[]>();
  for (const action of workflow.actions) {
    const inputLeaves = inspectLeaves(action.inputs, `${action.path}.inputs`, action);
    inspectLeaves(action.outputs, `${action.path}.outputs`, action);
    inspectLeaves(action.configuration, `${action.path}.runtimeConfiguration`, action);
    inspectLeaves(action.original.trackedProperties, `${action.path}.trackedProperties`, action);
    const inputs: JsonObject = isJsonObject(action.inputs) ? action.inputs : {};
    const configuration = isJsonObject(action.configuration) ? action.configuration : {};
    for (const leaf of inputLeaves) {
      if (typeof leaf.value !== "string") continue;
      const url = urlValue(leaf.value);
      if (!url || !["uri", "url"].includes(leaf.key.toLowerCase())) continue;
      const endpoint = `${url.origin}${url.pathname}`;
      endpointActions.set(endpoint, [...(endpointActions.get(endpoint) ?? []), action]);
      const authentication = isJsonObject(inputs.authentication) ? inputs.authentication : {};
      if (isAzureHost(url.hostname) && authentication.type !== "ManagedServiceIdentity") add({ code: "managed-identity", title: "Avalie Managed Identity para este destino Azure", description: "O hostname parece pertencer ao Azure. O suporte a Managed Identity depende do serviço, connector e operação.", category: "security", path: leaf.path, action, severity: "info", recommendation: "Confirme o suporte na documentação e configure a identidade e permissões mínimas quando aplicável.", why: "Uma identidade gerenciada pode reduzir a manutenção de segredos.", source: "identity", lowConfidence: true });
    }
    if (action.isTrigger) continue;
    if (/^(HTTP|Compose|Condition|Scope|For_each|Foreach|Switch|Parse_JSON|Response|Until)(?:_\d+)?$/i.test(action.name)) add({ code: "generic-name", title: "Nome de action pouco descritivo", description: "O nome indica o tipo da action, mas pouco sobre sua intenção.", category: "maintainability", path: action.path, action, severity: "info", recommendation: "Use um nome que descreva a tarefa de negócio, como Consultar_cliente.", why: "Nomes claros facilitam diagnóstico e manutenção." });
    if (!action.knownType) add({ code: "unknown-type", title: "Tipo de action preservado sem interpretação específica", description: "Esta action não está no catálogo local de tipos conhecidos.", category: "maintainability", path: `${action.path}.type`, action, deterministic: true, severity: "info", recommendation: "Consulte a documentação do tipo e revise inputs e configurações manualmente.", why: "A análise local não confirma o comportamento deste tipo." });
    if (action.depth > 5) add({ code: "deep-nesting", title: "Aninhamento elevado", description: "Esta action está em mais de cinco níveis de estruturas aninhadas.", category: "maintainability", path: action.path, action, recommendation: "Avalie extrair etapas para workflows menores ou simplificar os branches.", why: "Muitos níveis tornam os caminhos de execução difíceis de acompanhar." });
    if (action.type === "Http" && !isJsonObject(inputs.retryPolicy) && !isJsonObject(action.original.retryPolicy)) add({ code: "http-retry", title: "HTTP sem retry policy explícita", description: "Não há retry policy explícita nesta action. Isso não significa ausência de retry: o runtime pode aplicar a política padrão.", category: "reliability", path: `${action.path}.inputs`, action, recommendation: "Revise a política padrão e configure retry compatível com os limites e a idempotência do destino.", why: "Falhas transitórias e throttling precisam de uma estratégia previsível.", source: "errors" });
    if (externalTypes.has(action.type) && !actionHasFailurePath(action, workflow)) add({ code: "failure-path", title: "Operação externa sem caminho de falha identificável", description: "Não foi identificada uma dependência para falha ou timeout nesta action ou em seus containers. Sua criticidade depende do cenário.", category: "reliability", path: `${action.path}.runAfter`, action, recommendation: "Avalie um Scope de tratamento com Run After para Failed e TimedOut.", why: "Falhas externas podem interromper o processamento sem recuperação ou diagnóstico.", source: "errors" });
    if (externalTypes.has(action.type) && !action.original.limit && !inputs.timeout && !configuration.timeout) add({ code: "timeout-review", title: "Revise o tempo de espera da operação", description: "Não há um limite de tempo explícito identificável. O runtime ou connector pode aplicar um padrão próprio.", category: "reliability", path: action.path, action, severity: "info", recommendation: "Valide limites suportados, duração do destino e comportamento de timeout no Run History.", why: "Uma chamada lenta pode prolongar toda a execução.", source: "errors", lowConfidence: true });
    if (action.type === "Until" || action.type === "Foreach") {
      const limit = isJsonObject(action.original.limit) ? action.original.limit : {};
      const concurrency = isJsonObject(configuration.concurrency) ? configuration.concurrency : {};
      const riskyUntil = action.type === "Until" && (!limit.count || !limit.timeout || typeof limit.count === "number" && limit.count > 100);
      const riskyForeach = action.type === "Foreach" && (typeof concurrency.repetitions !== "number" || concurrency.repetitions > 20);
      if (riskyUntil || riskyForeach) add({ code: "loop-risk", title: "Configuração do loop merece revisão", description: action.type === "Until" ? "O Until não tem limites explícitos completos ou usa muitas repetições." : "A concorrência do Foreach está implícita ou elevada. Isso pode ser apropriado, dependendo dos sistemas envolvidos.", category: "performance", path: action.type === "Until" ? `${action.path}.limit` : `${action.path}.runtimeConfiguration`, action, recommendation: "Revise limite, timeout, concorrência e idempotência; teste indisponibilidade e grandes coleções.", why: "Loops podem amplificar consumo, throttling e condições de corrida.", source: "errors" });
    }
    for (const [name, expectedStatuses] of Object.entries(action.runAfter)) {
      const dependencyPath = appendJsonPath(`${action.path}.runAfter`, name);
      if (!expectedStatuses.length || expectedStatuses.some((status) => !statuses.has(status))) add({ code: "invalid-dependency-status", title: "Status de Run After vazio ou não reconhecido", description: "Foi encontrado um conjunto vazio ou um status que não está no catálogo local.", category: "reliability", path: dependencyPath, action, deterministic: true, recommendation: "Confira os status válidos e o comportamento esperado no designer.", why: "A dependência pode impedir a execução desta etapa.", source: "errors" });
      if (!workflow.dependencies.some((dependency) => !dependency.structural && dependency.target === action.id && byId.get(dependency.source)?.name === name)) add({ code: "unresolved-dependency", title: "Dependência não resolvida neste bloco", description: "O nome referenciado por Run After não corresponde a outra action do mesmo bloco.", category: "reliability", path: dependencyPath, action, deterministic: true, recommendation: "Corrija a referência respeitando o bloco local, inclusive branches de condições e cases.", why: "Um nome igual em outro branch não é uma dependência local válida.", source: "errors" });
      if (expectedStatuses.includes("Skipped") && !expectedStatuses.includes("Succeeded")) add({ code: "fragile-dependency", title: "Execução depende de uma etapa ignorada", description: "O caminho inclui Skipped sem Succeeded. Pode ser um tratamento intencional, mas merece validação.", category: "reliability", path: dependencyPath, action, recommendation: "Simule branches diferentes e confirme se a execução após Skipped é desejada.", why: "Etapas ignoradas podem ter outputs ausentes.", source: "errors" });
    }
    if (action.type === "Response") {
      const ancestors = new Set<string>();
      const queue = [action.id];
      for (let index = 0; index < queue.length; index++) for (const dependency of workflow.dependencies) {
        if (dependency.target === queue[index] && !ancestors.has(dependency.source)) { ancestors.add(dependency.source); queue.push(dependency.source); }
      }
      const externalCount = [...ancestors].filter((id) => externalTypes.has(byId.get(id)?.type ?? "")).length;
      if (externalCount >= 3) add({ code: "response-chain", title: "Resposta depende de várias operações externas", description: "A resposta possui pelo menos três operações externas em seus caminhos de dependência.", category: "performance", path: action.path, action, recommendation: "Avalie processamento assíncrono e teste latência acumulada e timeout do chamador.", why: "A lentidão de vários sistemas pode exceder o tempo de espera HTTP.", source: "errors" });
      const statusCode = typeof inputs.statusCode === "number" ? inputs.statusCode : typeof inputs.statusCode === "string" ? Number(inputs.statusCode) : 0;
      if (statusCode >= 400 && (!isJsonObject(inputs.body) || !["code", "message", "correlationId", "error"].some((key) => Object.hasOwn(inputs.body as JsonObject, key)))) add({ code: "error-context", title: "Resposta de erro com contexto limitado", description: "Uma resposta com status de erro não apresenta campos de contexto identificáveis no body.", category: "observability", path: `${action.path}.inputs.body`, action, recommendation: "Inclua um código estável, mensagem segura e correlation ID sem detalhes sensíveis.", why: "O chamador precisa relacionar a falha à execução correta.", source: "monitoring" });
    }
    const fingerprint = `${action.type}:${inputLeaves.map((leaf) => `${leaf.path.slice(action.path.length)}:${String(leaf.value)}`).sort().join("|")}`;
    if (inputLeaves.length) fingerprints.set(fingerprint, [...(fingerprints.get(fingerprint) ?? []), action]);
    if (isJsonObject(action.original.actions) && Object.keys(action.original.actions).length > 15) add({ code: "large-block", title: "Bloco extenso de lógica", description: "Um container possui mais de quinze actions diretas.", category: "maintainability", path: `${action.path}.actions`, action, recommendation: "Agrupe tarefas com intenção clara e avalie extrair operações reutilizáveis.", why: "Blocos extensos tornam revisão e diagnóstico mais difíceis." });
  }
  inspectLeaves(workflow.parameters, `${workflow.definitionPath}.parameters`);
  inspectLeaves(workflow.outputs, `${workflow.definitionPath}.outputs`);
  for (const [name, parameter] of Object.entries(workflow.parameters)) {
    if (isJsonObject(parameter) && typeof parameter.type === "string" && /^secure(string|object)$/i.test(parameter.type) && parameter.defaultValue) add({ code: "secure-default", title: "Parâmetro seguro com valor padrão embutido", description: "Um parâmetro seguro tem valor padrão não vazio na definição. O tipo seguro não remove esse literal do arquivo.", category: "security", path: `${appendJsonPath(`${workflow.definitionPath}.parameters`, name)}.defaultValue`, deterministic: true, critical: true, recommendation: "Remova o segredo do defaultValue e forneça uma referência segura durante a configuração.", why: "Compartilhar o JSON pode expor o valor padrão.", source: "security" });
  }
  for (const group of endpointActions.values()) if (new Set(group.map((action) => action.id)).size > 1) add({ code: "repeated-endpoint", title: "Endpoint repetido em várias actions", description: "Mais de uma action aponta para o mesmo host e caminho. Isso pode ser intencional.", category: "maintainability", path: `${group[0].path}.inputs`, action: group[0], severity: "info", recommendation: "Avalie centralizar a configuração do endpoint e revisar chamadas redundantes.", why: "Repetições dificultam a mudança do destino e podem aumentar chamadas desnecessárias." });
  for (const group of fingerprints.values()) if (group.length > 1) add({ code: "duplicate-action", title: "Actions com tipo e inputs equivalentes", description: "Duas ou mais actions apresentam o mesmo tipo e valores de inputs na inspeção local. Os caminhos e dependências podem justificar a repetição.", category: "maintainability", path: group[0].path, action: group[0], severity: "info", recommendation: "Revise a intenção antes de reutilizar ou remover qualquer etapa.", why: "Lógica repetida pode divergir em futuras alterações.", lowConfidence: true });
  const complex = runtimeActions.length > 15 || workflow.summary.maximumDepth > 4;
  const centralHandler = workflow.dependencies.some((dependency) => !dependency.structural && dependency.statuses.some((status) => failureStatuses.has(status)) && byId.get(dependency.target)?.type === "Scope");
  const anyFailurePath = workflow.dependencies.some((dependency) => !dependency.structural && dependency.statuses.some((status) => failureStatuses.has(status)));
  if (runtimeActions.some((action) => externalTypes.has(action.type)) && !centralHandler) add({ code: "central-error", title: "Tratamento centralizado não identificado", description: "Não foi identificado um Scope acionado por falha ou timeout. Outros padrões de tratamento podem existir.", category: "reliability", path: `${workflow.definitionPath}.actions`, recommendation: "Considere centralizar recuperação e diagnóstico de operações críticas quando adequado.", why: "Um tratamento consistente facilita manutenção e investigação.", source: "errors", lowConfidence: true });
  if (complex && workflow.summary.scopeCount < 2) add({ code: "complex-without-scopes", title: "Fluxo complexo com poucos Scopes", description: "A quantidade ou profundidade de actions sugere revisar a organização de processamento e tratamento.", category: "maintainability", path: `${workflow.definitionPath}.actions`, recommendation: "Avalie Scopes com responsabilidades claras e tratamento de erro explícito.", why: "Dividir responsabilidades ajuda a compreender o status de cada parte.", source: "errors" });
  if (runtimeActions.length > 20) add({ code: "large-block", title: "Workflow com muitas etapas", description: "O workflow possui mais de vinte actions, incluindo etapas aninhadas.", category: "maintainability", path: `${workflow.definitionPath}.actions`, recommendation: "Revise a divisão de responsabilidades e documente os principais caminhos.", why: "Workflows extensos exigem mais esforço para revisão." });
  const definitionLeaves = collectLeaves(workflow.definition, workflow.definitionPath);
  const hasCorrelation = definitionLeaves.leaves.some((leaf) => /correlation[-_]?id|clienttrackingid|x-correlation-id|trackingid/i.test(leaf.key) || typeof leaf.value === "string" && /correlation[-_]?id|clienttrackingid|trackingid/i.test(leaf.value));
  if (!hasCorrelation) add({ code: "correlation-id", title: "Correlation ID de negócio não identificável", description: "A inspeção não encontrou um identificador de correlação explícito. O runtime possui seus próprios identificadores; isso não confirma ausência de rastreabilidade.", category: "observability", path: workflow.definitionPath, severity: "info", recommendation: "Considere propagar um identificador entre sistemas e relacioná-lo ao Run History.", why: "Um identificador comum ajuda a acompanhar uma integração inteira.", source: "monitoring", lowConfidence: true });
  if (runtimeActions.length && !anyFailurePath) add({ code: "structured-error", title: "Caminho estruturado de erro não identificado", description: "Nenhuma dependência explícita de falha ou timeout foi identificada.", category: "observability", path: `${workflow.definitionPath}.actions`, severity: "info", recommendation: "Avalie um caminho com código, contexto seguro e identificador da execução.", why: "Erros sem contexto exigem mais investigação manual.", source: "errors", lowConfidence: true });
  const hasDiagnosticContext = definitionLeaves.leaves.some((leaf) => /trackedProperties(?:\.|\[)/i.test(leaf.path) || /clienttrackingid/i.test(leaf.key) || typeof leaf.value === "string" && /@(?:result|workflow)\s*\(/i.test(leaf.value));
  if (complex && !hasDiagnosticContext) add({ code: "diagnostic-context", title: "Contexto explícito de diagnóstico não identificado", description: "Não foram identificadas referências comuns de execução ou correlação na inspeção local. O monitoramento pode estar configurado fora do JSON.", category: "observability", path: workflow.definitionPath, recommendation: "Revise Run History, tracked properties e monitoramento configurado no recurso.", why: "Fluxos complexos precisam relacionar falha, action e execução.", source: "monitoring", lowConfidence: true });
  return findings;
}
