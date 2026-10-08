import type { JsonObject, JsonValue, ParsedWorkflow, WorkflowAction, WorkflowDependency } from "@/types/workflow";

export const PARSER_LIMITS = { maxInputBytes: 2 * 1024 * 1024, maxDepth: 32, maxNodes: 1500 } as const;
export const KNOWN_ACTION_TYPES = new Set(["Request", "Recurrence", "Http", "HttpWebhook", "HttpWait", "ApiConnection", "ApiConnectionWebhook", "ApiConnectionNotification", "ServiceProvider", "Scope", "If", "Condition", "Foreach", "Until", "Switch", "Compose", "ParseJson", "Response", "Terminate", "Wait", "InitializeVariable", "SetVariable", "IncrementVariable", "DecrementVariable", "AppendToArrayVariable", "AppendToStringVariable", "Select", "Query", "Join", "Table", "Workflow", "Function", "JavaScriptCode", "Liquid", "XmlValidation", "FlatFileEncoding", "FlatFileDecoding", "Xslt", "SendToBatch", "SlidingWindow"]);

export function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function appendJsonPath(path: string, key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}

interface DefinitionLocation { definition: JsonObject; path: string; resource: JsonObject }

function findDefinition(original: JsonObject): DefinitionLocation | undefined {
  const candidates: { value: JsonObject; path: string }[] = [{ value: original, path: "$" }];
  for (let index = 0; index < candidates.length && index < 2000; index++) {
    const { value, path } = candidates[index];
    const properties = isJsonObject(value.properties) ? value.properties : undefined;
    if (properties && isJsonObject(properties.definition)) return { definition: properties.definition, path: `${path}.properties.definition`, resource: value };
    if (isJsonObject(value.definition)) return { definition: value.definition, path: `${path}.definition`, resource: value };
    if (Object.hasOwn(value, "actions") || Object.hasOwn(value, "triggers")) return { definition: value, path, resource: value };
    if (Array.isArray(value.resources)) value.resources.forEach((resource, position) => {
      if (isJsonObject(resource)) candidates.push({ value: resource, path: `${path}.resources[${position}]` });
    });
  }
}

function determineHosting(resource: JsonObject): ParsedWorkflow["hosting"] {
  const resourceType = typeof resource.type === "string" ? resource.type.toLowerCase() : "";
  if (resourceType === "microsoft.logic/workflows") return "Consumption";
  if (resourceType === "microsoft.web/sites" && typeof resource.kind === "string" && resource.kind.toLowerCase().split(",").map((part) => part.trim()).includes("workflowapp")) return "Standard";
  return "Não foi possível determinar";
}

export function parseWorkflow(input: string): ParsedWorkflow {
  if (new TextEncoder().encode(input).byteLength > PARSER_LIMITS.maxInputBytes) throw new Error("O arquivo ultrapassa o limite de 2 MB. Divida o conteúdo antes de analisar.");
  let parsed: unknown;
  try { parsed = JSON.parse(input) as unknown; } catch { throw new Error("JSON inválido. Verifique aspas, vírgulas e chaves antes de tentar novamente."); }
  if (!isJsonObject(parsed)) throw new Error("O workflow precisa ser um objeto JSON.");
  const location = findDefinition(parsed);
  if (!location) throw new Error("Não foi encontrada uma definição de workflow com actions ou triggers.");
  const { definition, path: definitionPath, resource } = location;
  if (definition.actions !== undefined && !isJsonObject(definition.actions)) throw new Error("A propriedade actions do workflow precisa ser um objeto.");
  if (definition.triggers !== undefined && !isJsonObject(definition.triggers)) throw new Error("A propriedade triggers do workflow precisa ser um objeto.");
  const actions: WorkflowAction[] = [];
  const dependencies: WorkflowDependency[] = [];
  const warnings: string[] = [];
  const warningSet = new Set<string>();
  let partial = false;
  const warn = (message: string, incomplete = false) => {
    if (!warningSet.has(message) && warnings.length < 100) { warningSet.add(message); warnings.push(message); }
    if (incomplete) partial = true;
  };
  const groups: { path: string; nodes: WorkflowAction[]; parentId?: string; branch?: string; isTrigger: boolean }[] = [];
  const visitGroup = (value: JsonValue | undefined, path: string, depth: number, isTrigger: boolean, parentId?: string, branch?: string) => {
    if (value === undefined) return;
    if (!isJsonObject(value)) { warn(`Estrutura de actions inválida em ${path}; este trecho não foi analisado.`, true); return; }
    if (depth > PARSER_LIMITS.maxDepth) { warn(`Limite de profundidade (${PARSER_LIMITS.maxDepth}) atingido; análise parcial.`, true); return; }
    const group = { path, nodes: [] as WorkflowAction[], parentId, branch, isTrigger };
    groups.push(group);
    for (const [name, raw] of Object.entries(value)) {
      if (actions.length >= PARSER_LIMITS.maxNodes) { warn(`Limite de ${PARSER_LIMITS.maxNodes} etapas atingido; análise parcial.`, true); break; }
      const actionPath = appendJsonPath(path, name);
      if (!isJsonObject(raw)) { warn(`Action inválida em ${actionPath}; outras etapas foram preservadas.`, true); continue; }
      const type = typeof raw.type === "string" && raw.type ? raw.type : "Unknown";
      if (type === "Unknown") warn(`Tipo de action ausente em ${actionPath}.`, true);
      const runAfterEntries: [string, string[]][] = [];
      if (raw.runAfter !== undefined && !isJsonObject(raw.runAfter)) warn(`runAfter inválido em ${actionPath}.`, true);
      if (isJsonObject(raw.runAfter)) for (const [dependencyName, statuses] of Object.entries(raw.runAfter)) {
        if (Array.isArray(statuses) && statuses.every((status) => typeof status === "string")) runAfterEntries.push([dependencyName, statuses as string[]]);
        else warn(`Status de dependência inválido em ${appendJsonPath(`${actionPath}.runAfter`, dependencyName)}.`, true);
      }
      const action: WorkflowAction = { id: actionPath, path: actionPath, name, type, knownType: KNOWN_ACTION_TYPES.has(type), depth, isTrigger, runAfter: Object.fromEntries(runAfterEntries), original: raw, ...(parentId ? { parentId } : {}), ...(branch ? { branch } : {}), ...(raw.inputs !== undefined ? { inputs: raw.inputs } : {}), ...(raw.outputs !== undefined ? { outputs: raw.outputs } : {}), ...(raw.runtimeConfiguration !== undefined ? { configuration: raw.runtimeConfiguration } : {}) };
      actions.push(action);
      group.nodes.push(action);
      visitGroup(raw.actions, `${actionPath}.actions`, depth + 1, false, action.id, type === "If" || type === "Condition" ? "Verdadeiro" : "Conteúdo");
      const visitBranch = (branchValue: JsonValue, branchPath: string, label: string) => {
        if (!isJsonObject(branchValue)) { warn(`Container de branch inválido em ${branchPath}; este trecho não foi analisado.`, true); return; }
        if (!Object.hasOwn(branchValue, "actions")) { warn(`Propriedade actions ausente em ${branchPath}.actions; este branch precisa de revisão.`, true); return; }
        visitGroup(branchValue.actions, `${branchPath}.actions`, depth + 1, false, action.id, label);
      };
      if (raw.else !== undefined) visitBranch(raw.else, `${actionPath}.else`, "Falso");
      if (raw.cases !== undefined && !isJsonObject(raw.cases)) warn(`Cases inválidos em ${actionPath}.cases.`, true);
      if (isJsonObject(raw.cases)) for (const [caseName, caseValue] of Object.entries(raw.cases)) {
        visitBranch(caseValue, appendJsonPath(`${actionPath}.cases`, caseName), `Case: ${caseName}`);
      }
      if (raw.default !== undefined) visitBranch(raw.default, `${actionPath}.default`, "Default");
    }
  };
  visitGroup(definition.triggers, `${definitionPath}.triggers`, 0, true);
  visitGroup(definition.actions, `${definitionPath}.actions`, 0, false);
  const triggers = actions.filter((action) => action.isTrigger);
  for (const group of groups) {
    const localNames = new Map(group.nodes.map((action) => [action.name, action.id]));
    for (const action of group.nodes) {
      for (const [dependencyName, statuses] of Object.entries(action.runAfter)) {
        const source = localNames.get(dependencyName);
        if (source && source !== action.id) dependencies.push({ source, target: action.id, statuses: [...statuses], structural: false });
        else warn(`A dependência em ${appendJsonPath(`${action.path}.runAfter`, dependencyName)} não foi resolvida neste bloco.`);
      }
      if (!Object.keys(action.runAfter).length && !group.isTrigger) {
        if (group.parentId) dependencies.push({ source: group.parentId, target: action.id, statuses: [], structural: true, label: group.branch });
        else for (const trigger of triggers) dependencies.push({ source: trigger.id, target: action.id, statuses: [], structural: true, label: "Início" });
      }
    }
  }
  const runtimeActions = actions.filter((action) => !action.isTrigger);
  const name = typeof resource.name === "string" ? resource.name : typeof parsed.name === "string" ? parsed.name : "Workflow sem nome";
  return { name, hosting: determineHosting(resource), original: parsed, sourceText: input, definition, definitionPath, actions, dependencies, parameters: isJsonObject(definition.parameters) ? definition.parameters : {}, outputs: isJsonObject(definition.outputs) ? definition.outputs : {}, ...(definition.runtimeConfiguration !== undefined ? { runtimeConfiguration: definition.runtimeConfiguration } : {}), summary: { triggerCount: triggers.length, actionCount: runtimeActions.length, scopeCount: runtimeActions.filter((action) => action.type === "Scope").length, conditionCount: runtimeActions.filter((action) => ["If", "Condition", "Switch"].includes(action.type)).length, loopCount: runtimeActions.filter((action) => ["Foreach", "Until"].includes(action.type)).length, maximumDepth: Math.max(0, ...actions.map((action) => action.depth)), actionTypes: [...new Set(actions.map((action) => action.type))].sort() }, warnings, partial };
}
