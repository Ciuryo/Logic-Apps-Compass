import { redactContent } from "@/lib/security/redaction";
import type { JsonValue } from "@/types/workflow";
import { workflowPlanSchema } from "./schema";
import { validateWorkflowPlan } from "./validate";
import type {
  WorkflowBuilderAction,
  WorkflowBuilderArtifacts,
  WorkflowBuilderJsonSchema,
  WorkflowBuilderValue,
  WorkflowPlan,
  WorkflowPlanValidationIssue,
} from "./types";

const workflowDefinitionSchema = "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#";
const armDeploymentSchema = "https://schema.management.azure.com/schemas/2015-01-01/deploymentTemplate.json#";
const logicAppApiVersion = "2019-05-01";
const markdownSpecialCharacters = new Set(["\\", "`", "*", "_", "{", "}", "[", "]", "(", ")", "#", "+", "-", ".", "!", "|", ">"]);

export class WorkflowGenerationError extends Error {
  readonly issues: WorkflowPlanValidationIssue[];

  constructor(message: string, issues: WorkflowPlanValidationIssue[]) {
    super(message);
    this.name = "WorkflowGenerationError";
    this.issues = issues;
  }
}

function uniqueCredentialParameterNames(plan: WorkflowPlan): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const action of plan.actions) {
    if (action.kind !== "Http" || action.authentication.kind === "none") continue;
    if (seen.has(action.authentication.parameterName)) continue;
    seen.add(action.authentication.parameterName);
    names.push(action.authentication.parameterName);
  }
  return names;
}

function schemaAtPath(root: WorkflowBuilderJsonSchema | undefined, path: string[]): WorkflowBuilderJsonSchema | undefined {
  let current = root;
  for (const segment of path) {
    if (!current) return undefined;
    if (current.type === "object") current = current.properties[segment];
    else if (current.type === "array" && /^(0|[1-9]\d*)$/.test(segment)) current = current.items;
    else return undefined;
  }
  return current;
}

function schemaFromLiteral(value: JsonValue): WorkflowBuilderJsonSchema {
  if (value === null) return { type: "null" };
  if (typeof value === "string") return { type: "string" };
  if (typeof value === "boolean") return { type: "boolean" };
  if (typeof value === "number") return { type: Number.isInteger(value) ? "integer" : "number" };
  if (Array.isArray(value)) return { type: "array", items: value.length ? schemaFromLiteral(value[0] ?? null) : { type: "null" } };
  return {
    type: "object",
    properties: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, schemaFromLiteral(item)])),
    additionalProperties: false,
  };
}

function schemaForValue(value: WorkflowBuilderValue, plan: WorkflowPlan, actionLimit: number): WorkflowBuilderJsonSchema | undefined {
  if (value.kind === "literal") return schemaFromLiteral(value.value);
  if (value.source === "trigger") return plan.trigger.kind === "Request" ? schemaAtPath(plan.trigger.requestSchema, value.path) : undefined;
  const referencedIndex = plan.actions.findIndex((candidate) => candidate.name === value.actionName);
  if (referencedIndex < 0 || referencedIndex >= actionLimit) return undefined;
  const referencedAction = plan.actions[referencedIndex];
  if (!referencedAction || referencedAction.kind === "Response") return undefined;
  const root = referencedAction.kind === "Http"
    ? referencedAction.responseSchema
    : schemaForValue(referencedAction.inputs, plan, referencedIndex);
  return schemaAtPath(root, value.path);
}

function wdlReference(value: Extract<WorkflowBuilderValue, { kind: "reference" }>, plan: WorkflowPlan, actionIndex: number): string {
  let expression: string;
  let rootSchema: WorkflowBuilderJsonSchema | undefined;
  if (value.source === "trigger") {
    expression = "triggerBody()";
    rootSchema = plan.trigger.kind === "Request" ? plan.trigger.requestSchema : undefined;
  } else {
    const sourceIndex = plan.actions.findIndex((action) => action.name === value.actionName);
    const sourceAction = plan.actions[sourceIndex];
    if (!sourceAction || sourceIndex < 0 || sourceIndex >= actionIndex || sourceAction.kind === "Response") {
      throw new WorkflowGenerationError("Não foi possível gerar uma referência tipada do workflow.", [
        { code: "unresolved-generated-reference", path: ["actions", actionIndex], message: "A referência tipada não aponta para uma etapa anterior válida." },
      ]);
    }
    expression = sourceAction.kind === "Http" ? `body('${sourceAction.name}')` : `outputs('${sourceAction.name}')`;
    rootSchema = sourceAction.kind === "Http" ? sourceAction.responseSchema : schemaForValue(sourceAction.inputs, plan, sourceIndex);
  }

  let currentSchema = rootSchema;
  for (const segment of value.path) {
    if (currentSchema?.type === "array" && /^(0|[1-9]\d*)$/.test(segment)) {
      expression += `?[${segment}]`;
      currentSchema = currentSchema.items;
    } else if (currentSchema?.type === "object" && Object.hasOwn(currentSchema.properties, segment)) {
      expression += `?['${segment}']`;
      currentSchema = currentSchema.properties[segment];
    } else {
      throw new WorkflowGenerationError("Não foi possível gerar uma referência tipada do workflow.", [
        { code: "unresolved-generated-reference", path: ["actions", actionIndex], message: "O caminho da referência não corresponde ao contrato validado." },
      ]);
    }
  }
  return `@${expression}`;
}

function escapeWdlLiteralString(value: string): string {
  let escaped = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "@" && (index === 0 || value[index + 1] === "{")) escaped += "@@";
    else escaped += character;
  }
  return escaped;
}

function escapeWdlLiterals(value: JsonValue): JsonValue {
  if (typeof value === "string") return escapeWdlLiteralString(value);
  if (Array.isArray(value)) return value.map(escapeWdlLiterals);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, escapeWdlLiterals(item)]));
  }
  return value;
}

function wdlValue(value: WorkflowBuilderValue, plan: WorkflowPlan, actionIndex: number): JsonValue {
  return value.kind === "literal" ? escapeWdlLiterals(value.value) : wdlReference(value, plan, actionIndex);
}

function authParameterExpression(parameterName: string): string {
  return `@parameters('${parameterName}')`;
}

function generatedAction(action: WorkflowBuilderAction, plan: WorkflowPlan, index: number, previousAction: WorkflowBuilderAction | undefined): Record<string, JsonValue> {
  const runAfter = previousAction ? { [previousAction.name]: ["Succeeded"] } : {};
  if (action.kind === "Compose") {
    return { type: "Compose", inputs: wdlValue(action.inputs, plan, index), runAfter };
  }
  if (action.kind === "Response") {
    const inputs: Record<string, JsonValue> = {
      statusCode: action.statusCode,
      headers: Object.fromEntries(Object.entries(action.headers).map(([name, value]) => [name, wdlValue(value, plan, index)])),
    };
    if (action.body) inputs.body = wdlValue(action.body, plan, index);
    return { type: "Response", kind: "http", inputs, runAfter };
  }

  const headers: Record<string, JsonValue> = Object.fromEntries(
    Object.entries(action.headers).map(([name, value]) => [name, wdlValue(value, plan, index)]),
  );
  const inputs: Record<string, JsonValue> = { method: action.method, uri: action.uri };
  if (action.authentication.kind === "header") headers[action.authentication.headerName] = authParameterExpression(action.authentication.parameterName);
  if (Object.keys(headers).length) inputs.headers = headers;
  if (action.body) inputs.body = wdlValue(action.body, plan, index);
  if (action.authentication.kind === "bearer") {
    inputs.authentication = {
      type: "Raw",
      value: `@{concat('Bearer ', parameters('${action.authentication.parameterName}'))}`,
    };
  }
  const generated: Record<string, JsonValue> = { type: "Http", inputs, runAfter };
  if (action.authentication.kind !== "none") {
    generated.runtimeConfiguration = { secureData: { properties: ["inputs", "outputs"] } };
  }
  return generated;
}

function containsCredentialLikeLiteral(plan: WorkflowPlan): boolean {
  if (redactContent(plan.name).redactionCount > 0) return true;
  for (const action of plan.actions) {
    if (action.kind === "Http" && redactContent(action.uri).redactionCount > 0) return true;
    const values: WorkflowBuilderValue[] = [];
    if (action.kind === "Compose") values.push(action.inputs);
    if (action.kind === "Http" || action.kind === "Response") {
      if (action.body) values.push(action.body);
      values.push(...Object.values(action.headers));
    }
    for (const value of values) {
      if (value.kind === "literal" && redactContent(JSON.stringify(value.value)).redactionCount > 0) return true;
    }
  }
  return false;
}

function markdownText(value: string): string {
  let escaped = "";
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 31 || code === 127) escaped += " ";
    else escaped += markdownSpecialCharacters.has(character) ? `\\${character}` : character;
  }
  return escaped;
}

function createReadme(plan: WorkflowPlan, credentialNames: string[]): string {
  const actionSummary = plan.actions.length
    ? plan.actions.map((action) => {
      const description = action.kind === "Http" ? `HTTP ${action.method}` : action.kind;
      return `- \`${markdownText(action.name)}\`: ${description}.`;
    }).join("\n")
    : "- Nenhuma action foi incluída.";
  const credentials = credentialNames.length
    ? credentialNames.map((name) => `- \`${markdownText(name)}\`: parâmetro seguro solicitado durante a implantação.`).join("\n")
    : "Este workflow não usa parâmetros de autenticação.";

  return [
    `# ${markdownText(plan.name)}`,
    "",
    "Pacote de Azure Logic Apps **Consumption** gerado localmente pelo Logic Apps Compass.",
    "",
    "## Workflow",
    "",
    `- Gatilho: ${plan.trigger.kind}.`,
    actionSummary,
    "",
    "## Parâmetros de autenticação",
    "",
    credentials,
    "",
    "Os valores de credenciais não estão incluídos nos arquivos. Informe-os somente nos campos seguros do processo de implantação. Actions HTTP autenticadas ocultam entradas e saídas no histórico de execução do workflow.",
    "",
    "## Implantação manual",
    "",
    "1. Revise a definição WDL e o template `azuredeploy.json`, incluindo endpoint, método, contratos JSON e parâmetros exigidos.",
    "2. Use seu processo habitual de implantação de templates ARM para selecionar grupo de recursos e região, informar o nome do Logic App e preencher os parâmetros seguros solicitados.",
    "3. Revise as permissões, o custo e o comportamento da API de destino antes de implantar ou executar o workflow.",
    "",
    "O Compass não chama o Azure, não implanta recursos e não testa endpoints externos. A validação local cobre apenas o subconjunto suportado pelo gerador; ela não substitui a revisão no Azure nem confirma que o template será implantável em toda assinatura ou que a API terá o comportamento esperado.",
    "",
    "Referências oficiais: [ARM para Logic Apps Consumption](https://learn.microsoft.com/en-us/azure/logic-apps/quickstart-create-deploy-azure-resource-manager-template) · [Parâmetros seguros e dados de execução](https://learn.microsoft.com/en-us/azure/logic-apps/set-up-security-permissions).",
    "",
  ].join("\n");
}

export function generateWorkflowArtifacts(plan: WorkflowPlan): WorkflowBuilderArtifacts {
  const parsedPlan = workflowPlanSchema.safeParse(plan);
  if (!parsedPlan.success) {
    throw new WorkflowGenerationError("O plano do workflow é inválido.", [{
      code: "invalid-plan-schema",
      path: [],
      message: "Revise os campos obrigatórios do plano antes de gerar os arquivos.",
    }]);
  }

  const validation = validateWorkflowPlan(parsedPlan.data);
  if (!validation.valid) throw new WorkflowGenerationError("O plano do workflow é inválido.", validation.issues);
  if (containsCredentialLikeLiteral(parsedPlan.data)) {
    throw new WorkflowGenerationError("O plano contém conteúdo que parece uma credencial. Substitua-o por um parâmetro seguro.", [{
      code: "credential-like-literal",
      path: ["actions"],
      message: "Remova valores que pareçam credenciais e use o placeholder de autenticação.",
    }]);
  }

  const normalizedPlan = parsedPlan.data;
  const credentialNames = uniqueCredentialParameterNames(normalizedPlan);
  const workflowParameters: Record<string, JsonValue> = Object.fromEntries(
    credentialNames.map((name) => [name, { type: "securestring" }]),
  );
  const triggers: Record<string, JsonValue> = normalizedPlan.trigger.kind === "Request"
    ? { [normalizedPlan.trigger.name]: { type: "Request", kind: "Http", inputs: { schema: normalizedPlan.trigger.requestSchema } } }
    : { [normalizedPlan.trigger.name]: { type: "Recurrence", recurrence: { frequency: normalizedPlan.trigger.frequency, interval: normalizedPlan.trigger.interval } } };
  const actions: Record<string, JsonValue> = Object.fromEntries(
    normalizedPlan.actions.map((action, index) => [action.name, generatedAction(action, normalizedPlan, index, normalizedPlan.actions[index - 1])]),
  );
  const workflowDefinitionObject: Record<string, JsonValue> = {
    $schema: workflowDefinitionSchema,
    contentVersion: "1.0.0.0",
    triggers,
    actions,
    parameters: workflowParameters,
    outputs: {},
  };
  const workflowDefinition = JSON.stringify(workflowDefinitionObject, null, 2);

  const armParameters: Record<string, JsonValue> = {
    workflowName: { type: "string", minLength: 1, maxLength: 80 },
    location: { type: "string", defaultValue: "[resourceGroup().location]" },
  };
  const workflowParameterValues: Record<string, JsonValue> = {};
  for (const name of credentialNames) {
    const templateParameterName = `auth_${name}`;
    armParameters[templateParameterName] = { type: "securestring" };
    workflowParameterValues[name] = { value: `[parameters('${templateParameterName}')]` };
  }
  const armTemplateObject: Record<string, JsonValue> = {
    $schema: armDeploymentSchema,
    contentVersion: "1.0.0.0",
    parameters: armParameters,
    resources: [{
      type: "Microsoft.Logic/workflows",
      apiVersion: logicAppApiVersion,
      name: "[parameters('workflowName')]",
      location: "[parameters('location')]",
      properties: {
        state: "Enabled",
        definition: workflowDefinitionObject,
        parameters: workflowParameterValues,
      },
    }],
    outputs: {},
  };

  return {
    workflowDefinition,
    armTemplate: JSON.stringify(armTemplateObject, null, 2),
    readme: createReadme(normalizedPlan, credentialNames),
  };
}
