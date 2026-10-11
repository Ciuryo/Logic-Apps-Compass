import { workflowPlanSchema } from "./schema";
import type {
  WorkflowBuilderAction,
  WorkflowBuilderJsonSchema,
  WorkflowBuilderValue,
  WorkflowPlan,
  WorkflowPlanValidation,
  WorkflowPlanValidationIssue,
} from "./types";

function issue(code: string, path: Array<string | number>, message: string): WorkflowPlanValidationIssue {
  return { code, path, message };
}

function schemaAtPath(root: WorkflowBuilderJsonSchema, path: string[]): WorkflowBuilderJsonSchema | undefined {
  let current: WorkflowBuilderJsonSchema | undefined = root;
  for (const segment of path) {
    if (!current) return undefined;
    if (current.type === "object") current = current.properties[segment];
    else if (current.type === "array" && /^(0|[1-9]\d*)$/.test(segment)) current = current.items;
    else return undefined;
  }
  return current;
}

const unsafePathPunctuation = new Set(["@", "'", "\"", "(", ")", "[", "]", "\\"]);
const missingValue = Symbol("missing-value");
const protectedHeader = /^(authorization|proxy-authorization|cookie|set-cookie|api-key|x-api-key|ocp-apim-subscription-key|x-functions-key)$/i;
const secretQueryKeys = new Set([
  "authorization", "proxyauthorization", "cookie", "setcookie", "ocpapimsubscriptionkey", "xfunctionskey",
  "clientsecret", "clientassertion", "password", "passwd", "pwd", "secret", "accesstoken", "refreshtoken",
  "idtoken", "token", "apikey", "subscriptionkey", "connectionstring", "accountkey", "sharedaccesskey",
  "sharedaccesssignature", "signature", "sig", "privatekey", "key", "code", "sas", "sastoken",
]);

function hasUnsafePathSegment(segment: string): boolean {
  for (const character of segment) {
    const code = character.charCodeAt(0);
    if (code <= 31 || code === 127 || unsafePathPunctuation.has(character)) return true;
  }
  return false;
}

function isSecretQueryKey(key: string): boolean {
  return secretQueryKeys.has(key.toLowerCase().replace(/[-_]/g, ""));
}

function valueAtPath(root: unknown, path: string[]): unknown | typeof missingValue {
  let current: unknown = root;
  for (const segment of path) {
    if (Array.isArray(current) && /^(0|[1-9]\d*)$/.test(segment)) {
      const index = Number(segment);
      if (index >= current.length) return missingValue;
      current = current[index];
    } else if (current !== null && typeof current === "object" && Object.hasOwn(current, segment)) {
      current = (current as Record<string, unknown>)[segment];
    } else return missingValue;
  }
  return current;
}

export function validateWorkflowPlan(plan: WorkflowPlan): WorkflowPlanValidation {
  const parsedPlan = workflowPlanSchema.safeParse(plan);
  if (!parsedPlan.success) {
    return {
      valid: false,
      issues: parsedPlan.error.issues.map((item) => issue("invalid-plan-schema", item.path.map((part) => typeof part === "symbol" ? part.toString() : part), item.message)),
    };
  }

  const normalizedPlan = parsedPlan.data;
  const issues: WorkflowPlanValidationIssue[] = [];
  const actionNames = new Map<string, number>();
  const actionIndexes = new Map<string, number>();
  normalizedPlan.actions.forEach((action, index) => {
    const normalizedName = action.name.toLowerCase();
    const previousIndex = actionNames.get(normalizedName);
    if (previousIndex !== undefined) issues.push(issue("duplicate-action-name", ["actions", index, "name"], "Cada action precisa ter um nome único."));
    else actionNames.set(normalizedName, index);
    actionIndexes.set(action.name, index);
  });

  const responseIndexes = normalizedPlan.actions.flatMap((action, index) => action.kind === "Response" ? [index] : []);
  if (responseIndexes.length && normalizedPlan.trigger.kind !== "Request") {
    issues.push(issue("response-requires-request-trigger", ["actions", responseIndexes[0], "kind"], "A action Response exige um gatilho Request."));
  }
  if (responseIndexes.length > 1) {
    for (const index of responseIndexes.slice(1)) issues.push(issue("multiple-response-actions", ["actions", index], "O workflow pode ter no máximo uma action Response."));
  }
  if (responseIndexes.length === 1 && responseIndexes[0] !== normalizedPlan.actions.length - 1) {
    issues.push(issue("response-must-be-last", ["actions", responseIndexes[0]], "A action Response deve ser a última etapa do workflow."));
  }

  function validateReference(value: WorkflowBuilderValue, actionIndex: number, path: Array<string | number>): void {
    if (value.kind !== "reference") return;
    for (const [segmentIndex, segment] of value.path.entries()) {
      if (hasUnsafePathSegment(segment)) issues.push(issue("invalid-reference-path", [...path, "path", segmentIndex], "Use somente nomes de campos ou índices; expressões WDL não são aceitas."));
    }

    if (value.source === "trigger") {
      if (normalizedPlan.trigger.kind !== "Request") {
        issues.push(issue("trigger-reference-requires-request", [...path, "source"], "O gatilho Recurrence não tem um corpo de requisição para referenciar."));
      } else if (!schemaAtPath(normalizedPlan.trigger.requestSchema, value.path)) {
        issues.push(issue("unknown-trigger-reference", [...path, "path"], "O campo referenciado não existe no contrato da requisição."));
      }
      return;
    }

    const referencedIndex = actionIndexes.get(value.actionName);
    if (referencedIndex === undefined) {
      issues.push(issue("unknown-action-reference", [...path, "actionName"], "A action referenciada não existe no workflow."));
      return;
    }
    if (referencedIndex >= actionIndex) {
      issues.push(issue("forward-action-reference", [...path, "actionName"], "A referência precisa apontar para uma action anterior."));
      return;
    }
    const referencedAction = normalizedPlan.actions[referencedIndex];
    if (referencedAction?.kind === "Response") {
      issues.push(issue("response-action-reference", [...path, "actionName"], "Uma action Response não produz dados para as etapas seguintes."));
    } else if (referencedAction?.kind === "Compose" && referencedAction.inputs.kind === "literal" && valueAtPath(referencedAction.inputs.value, value.path) === missingValue) {
      issues.push(issue("unknown-compose-reference-path", [...path, "path"], "O campo referenciado não existe no valor produzido pela action Compose."));
    } else if (referencedAction?.kind === "Http" && value.path.length) {
      if (!referencedAction.responseSchema) {
        issues.push(issue("missing-action-response-schema", [...path, "path"], "Informe o contrato da resposta HTTP para validar os campos usados por etapas seguintes."));
      } else if (!schemaAtPath(referencedAction.responseSchema, value.path)) {
        issues.push(issue("unknown-action-response-reference", [...path, "path"], "O campo referenciado não existe no contrato da resposta HTTP."));
      }
    }
  }

  function validateActionValues(action: WorkflowBuilderAction, actionIndex: number): void {
    const fields: Array<[WorkflowBuilderValue, Array<string | number>]> = [];
    if (action.kind === "Compose") fields.push([action.inputs, ["actions", actionIndex, "inputs"]]);
    if (action.kind === "Http" || action.kind === "Response") {
      if (action.body) fields.push([action.body, ["actions", actionIndex, "body"]]);
      for (const [headerName, value] of Object.entries(action.headers)) {
        fields.push([value, ["actions", actionIndex, "headers", headerName]]);
        if (protectedHeader.test(headerName)) {
          issues.push(issue("credential-header-requires-placeholder", ["actions", actionIndex, "headers", headerName], "Credenciais devem usar o campo de autenticação com placeholder seguro."));
        }
      }
      const headerNames = new Set<string>();
      for (const headerName of Object.keys(action.headers)) {
        const normalizedName = headerName.toLowerCase();
        if (headerNames.has(normalizedName)) issues.push(issue("duplicate-header-name", ["actions", actionIndex, "headers", headerName], "Nomes de header não podem se repetir, mesmo com letras maiúsculas diferentes."));
        headerNames.add(normalizedName);
      }
    }
    for (const [value, path] of fields) validateReference(value, actionIndex, path);
  }

  function validateEndpoint(action: Extract<WorkflowBuilderAction, { kind: "Http" }>, actionIndex: number): void {
    let url: URL;
    try { url = new URL(action.uri); }
    catch {
      issues.push(issue("invalid-endpoint-url", ["actions", actionIndex, "uri"], "Informe uma URL HTTPS válida."));
      return;
    }
    if (url.protocol !== "https:") issues.push(issue("endpoint-not-https", ["actions", actionIndex, "uri"], "Somente endpoints HTTPS podem ser exportados."));
    if (url.username || url.password) issues.push(issue("endpoint-contains-credentials", ["actions", actionIndex, "uri"], "A URL não pode conter usuário ou senha."));
    if (url.hash) issues.push(issue("endpoint-contains-fragment", ["actions", actionIndex, "uri"], "A URL não pode conter fragmento."));
    for (const [key] of url.searchParams) {
      if (isSecretQueryKey(key)) issues.push(issue("endpoint-query-looks-secret", ["actions", actionIndex, "uri"], "Remova parâmetros de query que possam conter credenciais."));
    }
  }

  normalizedPlan.actions.forEach((action, index) => {
    validateActionValues(action, index);
    if (action.kind === "Http") {
      validateEndpoint(action, index);
      if (action.method === "GET" && action.body) issues.push(issue("get-request-has-body", ["actions", index, "body"], "A ação GET não pode enviar body neste MVP."));
    }
  });

  return { valid: issues.length === 0, issues };
}
