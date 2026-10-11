import { isJsonObject, parseWorkflow } from "@/lib/logic-apps/parser";
import type { JsonObject } from "@/types/workflow";
import type { GeneratedWorkflowValidation, WorkflowBuilderArtifacts, WorkflowPlanValidationIssue } from "./types";

const supportedTriggers = new Set(["Request", "Recurrence"]);
const supportedActions = new Set(["Http", "Compose", "Response"]);
const allowedHttpMethods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const allowedRecurrenceFrequencies = new Set(["Second", "Minute", "Hour", "Day", "Week", "Month"]);
const secretQueryKeys = new Set([
  "authorization", "proxyauthorization", "cookie", "setcookie", "ocpapimsubscriptionkey", "xfunctionskey",
  "clientsecret", "clientassertion", "password", "passwd", "pwd", "secret", "accesstoken", "refreshtoken",
  "idtoken", "token", "apikey", "subscriptionkey", "connectionstring", "accountkey", "sharedaccesskey",
  "sharedaccesssignature", "signature", "sig", "privatekey", "key", "code", "sas", "sastoken",
]);
const deploymentSchema = "https://schema.management.azure.com/schemas/2015-01-01/deploymentTemplate.json#";
const workflowSchema = "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#";
const resourceType = "Microsoft.Logic/workflows";
const resourceApiVersion = "2019-05-01";

function addIssue(issues: WorkflowPlanValidationIssue[], code: string, path: Array<string | number>, message: string): void {
  issues.push({ code, path, message });
}

function asRecord(value: unknown): JsonObject | undefined {
  return isJsonObject(value) ? value : undefined;
}

function isSecureParameter(value: unknown): value is JsonObject {
  return isJsonObject(value) && typeof value.type === "string" && value.type.toLowerCase() === "securestring" && !Object.hasOwn(value, "defaultValue");
}

function validateWorkflowDefinition(source: string, issues: WorkflowPlanValidationIssue[]): JsonObject | undefined {
  let parsed: ReturnType<typeof parseWorkflow>;
  try {
    parsed = parseWorkflow(source);
  } catch {
    addIssue(issues, "invalid-workflow-definition", [], "A definição WDL não pôde ser analisada pelo parser local.");
    return undefined;
  }

  const definition = parsed.definition;
  if (definition.$schema !== workflowSchema) {
    addIssue(issues, "unsupported-workflow-shape", ["$schema"], "A definição não usa o schema WDL de Logic Apps Consumption esperado.");
  }
  if (parsed.partial) addIssue(issues, "unsupported-workflow-shape", [], "O parser local analisou apenas parte da definição WDL.");

  const triggers = parsed.actions.filter((action) => action.isTrigger);
  if (triggers.length !== 1 || !triggers[0] || !supportedTriggers.has(triggers[0].type)) {
    addIssue(issues, "unsupported-workflow-shape", ["triggers"], "O subconjunto local aceita exatamente um gatilho Request ou Recurrence.");
  } else if (triggers[0].type === "Request") {
    const inputs = asRecord(triggers[0].original.inputs);
    if (!inputs || !Object.hasOwn(inputs, "schema")) {
      addIssue(issues, "invalid-request-trigger", ["triggers", triggers[0].name, "inputs", "schema"], "O gatilho Request precisa conter o contrato JSON da entrada.");
    }
  } else {
    const recurrence = asRecord(triggers[0].original.recurrence);
    const frequency = recurrence?.frequency;
    const interval = recurrence?.interval;
    if (typeof frequency !== "string" || !allowedRecurrenceFrequencies.has(frequency) || typeof interval !== "number" || !Number.isInteger(interval) || interval < 1 || interval > 9999) {
      addIssue(issues, "invalid-recurrence-trigger", ["triggers", triggers[0].name, "recurrence"], "O gatilho Recurrence precisa de frequência e intervalo dentro dos limites locais.");
    }
  }
  const actions = parsed.actions.filter((action) => !action.isTrigger);
  for (const action of actions) {
    if (!supportedActions.has(action.type)) {
      addIssue(issues, "unsupported-workflow-shape", action.path.split(".").slice(-1), `A action ${action.name} não pertence ao subconjunto local suportado.`);
    }
  }
  if (actions.length > 100) addIssue(issues, "unsupported-workflow-shape", ["actions"], "A definição excede o limite local de 100 actions.");

  actions.forEach((action, index) => {
    const expectedRunAfter = index === 0 ? {} : { [actions[index - 1]?.name ?? ""]: ["Succeeded"] };
    if (JSON.stringify(action.runAfter) !== JSON.stringify(expectedRunAfter)) {
      addIssue(issues, "invalid-action-order", ["actions", action.name, "runAfter"], "As actions precisam executar em sequência após a etapa anterior bem-sucedida.");
    }
    if (action.type === "Http") {
      const inputs = asRecord(action.original.inputs);
      const method = inputs?.method;
      const uri = inputs?.uri;
      if (typeof method !== "string" || !allowedHttpMethods.has(method) || typeof uri !== "string" || !isSafeHttpsUri(uri)) {
        addIssue(issues, "invalid-http-action", ["actions", action.name, "inputs"], "A action HTTP precisa usar método permitido e endpoint HTTPS seguro.");
      }
      if (method === "GET" && inputs && Object.hasOwn(inputs, "body")) {
        addIssue(issues, "invalid-http-action", ["actions", action.name, "inputs", "body"], "A action GET não pode conter body neste subconjunto.");
      }
      if (inputs && Object.hasOwn(inputs, "authentication")) {
        const authentication = asRecord(inputs.authentication);
        if (authentication?.type !== "Raw" || typeof authentication.value !== "string" || !/^@\{concat\('Bearer ', parameters\('[A-Za-z][A-Za-z0-9_]*'\)\)\}$/.test(authentication.value)) {
          addIssue(issues, "unsupported-http-authentication", ["actions", action.name, "inputs", "authentication"], "A validação local aceita somente o placeholder Bearer gerado pelo Compass.");
        }
      }
      const headers = asRecord(inputs?.headers);
      const headerAuthentication = headers && Object.values(headers).some((value) => typeof value === "string" && /^@parameters\('[A-Za-z][A-Za-z0-9_]*'\)$/.test(value));
      if (Object.hasOwn(inputs ?? {}, "authentication") || headerAuthentication) {
        const runtimeConfiguration = asRecord(action.original.runtimeConfiguration);
        const secureData = asRecord(runtimeConfiguration?.secureData);
        const properties = Array.isArray(secureData?.properties) ? secureData.properties : [];
        if (!properties.includes("inputs") || !properties.includes("outputs")) {
          addIssue(issues, "missing-secure-data", ["actions", action.name, "runtimeConfiguration", "secureData"], "Actions HTTP autenticadas precisam ocultar inputs e outputs no histórico.");
        }
      }
    }
    if (action.type === "Response") {
      const inputs = asRecord(action.original.inputs);
      const statusCode = inputs?.statusCode;
      if (typeof statusCode !== "number" || !Number.isInteger(statusCode) || !((statusCode >= 200 && statusCode < 300) || (statusCode >= 400 && statusCode <= 599))) {
        addIssue(issues, "invalid-response-status", ["actions", action.name, "inputs", "statusCode"], "A action Response aceita códigos 2xx, 4xx ou 5xx.");
      }
    }
  });

  const responseActions = actions.filter((action) => action.type === "Response");
  if (responseActions.length > 1 || (responseActions.length === 1 && actions[actions.length - 1]?.name !== responseActions[0]?.name)) {
    addIssue(issues, "invalid-response-placement", ["actions"], "A action Response pode aparecer no máximo uma vez e deve ser a última etapa.");
  }
  if (responseActions.length && triggers[0]?.type !== "Request") {
    addIssue(issues, "invalid-response-trigger", ["actions"], "A action Response exige o gatilho Request.");
  }

  return definition;
}

function isSafeHttpsUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash) return false;
    for (const key of parsed.searchParams.keys()) {
      if (secretQueryKeys.has(key.toLowerCase().replace(/[-_]/g, ""))) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function validateArmTemplate(source: string, workflowDefinition: JsonObject | undefined, issues: WorkflowPlanValidationIssue[]): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch {
    addIssue(issues, "invalid-arm-template", [], "O template ARM não é um JSON válido.");
    return;
  }
  const template = asRecord(parsed);
  if (!template || template.$schema !== deploymentSchema || template.contentVersion !== "1.0.0.0") {
    addIssue(issues, "invalid-arm-template", [], "O template ARM precisa usar o schema de implantação e contentVersion suportados.");
    return;
  }
  const parameters = asRecord(template.parameters);
  const resources = Array.isArray(template.resources) ? template.resources : [];
  if (!parameters || resources.length !== 1 || !isJsonObject(resources[0])) {
    addIssue(issues, "invalid-arm-template", ["resources"], "O template precisa declarar um único recurso Logic Apps e parâmetros ARM.");
    return;
  }
  const resource = resources[0];
  const properties = asRecord(resource.properties);
  if (resource.type !== resourceType || resource.apiVersion !== resourceApiVersion || !properties || properties.state !== "Enabled") {
    addIssue(issues, "invalid-arm-template", ["resources", 0], "O template não contém o envelope esperado para um workflow Consumption.");
    return;
  }
  if (!isJsonObject(properties.definition) || !workflowDefinition || JSON.stringify(properties.definition) !== JSON.stringify(workflowDefinition)) {
    addIssue(issues, "arm-wdl-mismatch", ["resources", 0, "properties", "definition"], "A definição WDL do template ARM precisa corresponder à prévia validada.");
  }

  const workflowNameParameter = asRecord(parameters.workflowName);
  const locationParameter = asRecord(parameters.location);
  if (workflowNameParameter?.type !== "string" || workflowNameParameter.minLength !== 1 || workflowNameParameter.maxLength !== 80 || locationParameter?.type !== "string" || locationParameter.defaultValue !== "[resourceGroup().location]") {
    addIssue(issues, "invalid-arm-template", ["parameters"], "O template precisa solicitar nome e região com os limites de entrada esperados.");
  }
  if (resource.name !== "[parameters('workflowName')]" || resource.location !== "[parameters('location')]" ) {
    addIssue(issues, "invalid-arm-template", ["resources", 0], "O recurso Logic Apps precisa usar os parâmetros de nome e região do template.");
  }

  const workflowParameters = workflowDefinition && asRecord(workflowDefinition.parameters);
  const resourceParameters = asRecord(properties.parameters);
  for (const [name, definition] of Object.entries(workflowParameters ?? {})) {
    const mapped = asRecord(resourceParameters?.[name]);
    const expectedTemplateParameter = `auth_${name}`;
    const templateParameter = asRecord(parameters[expectedTemplateParameter]);
    if (!isSecureParameter(definition) || !mapped || mapped.value !== `[parameters('${expectedTemplateParameter}')]` || !isSecureParameter(templateParameter)) {
      addIssue(issues, "invalid-secure-parameter-wiring", ["parameters", name], "Parâmetros de autenticação precisam ser securestring, sem valor padrão, e ligados ao parâmetro ARM correspondente.");
    }
  }
  if (Object.keys(resourceParameters ?? {}).length !== Object.keys(workflowParameters ?? {}).length) {
    addIssue(issues, "invalid-secure-parameter-wiring", ["resources", 0, "properties", "parameters"], "O template ARM contém parâmetros de workflow extras ou ausentes.");
  }
  if (Object.keys(parameters).length !== Object.keys(workflowParameters ?? {}).length + 2) {
    addIssue(issues, "invalid-secure-parameter-wiring", ["parameters"], "O template ARM contém parâmetros extras ou ausentes.");
  }
}

export function validateGeneratedWorkflow(artifacts: WorkflowBuilderArtifacts): GeneratedWorkflowValidation {
  const issues: WorkflowPlanValidationIssue[] = [];
  const definition = validateWorkflowDefinition(artifacts.workflowDefinition, issues);
  validateArmTemplate(artifacts.armTemplate, definition, issues);
  if (typeof artifacts.readme !== "string" || artifacts.readme.length === 0) {
    addIssue(issues, "missing-readme", ["readme"], "O pacote precisa incluir instruções de revisão e implantação manual.");
  }
  return { valid: issues.length === 0, issues };
}
