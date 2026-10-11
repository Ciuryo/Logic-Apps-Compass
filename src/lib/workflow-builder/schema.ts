import { z } from "zod";
import type { JsonValue } from "@/types/workflow";
import type {
  WorkflowBuilderAction,
  WorkflowBuilderAuthentication,
  WorkflowBuilderJsonSchema,
  WorkflowBuilderResult,
  WorkflowBuilderTrigger,
  WorkflowBuilderValue,
  WorkflowPlan,
} from "./types";

const maxNameLength = 80;
const maxActions = 100;
const maxHeaders = 32;
const maxTextLength = 2000;
const maxJsonDepth = 16;
const maxJsonNodes = 1000;
const maxRequestSchemaDepth = 10;
const maxRequestSchemaNodes = 300;

const nameSchema = z.string().min(1).max(maxNameLength).regex(/^[A-Za-z][A-Za-z0-9_]*$/);
const headerNameSchema = z.string().min(1).max(128).regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/);
const fieldPathSchema = z.array(z.string().min(1).max(128)).max(32);

function addLimitIssue(context: z.RefinementCtx, path: (string | number)[], message: string): void {
  context.addIssue({ code: "custom", path, message });
}

function countJsonNodes(root: unknown): { depth: number; nodes: number; tooLong: boolean } {
  const pending: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 1 }];
  let depth = 0;
  let nodes = 0;
  let tooLong = false;
  while (pending.length && nodes <= maxJsonNodes) {
    const current = pending.pop();
    if (!current) break;
    nodes += 1;
    depth = Math.max(depth, current.depth);
    if (typeof current.value === "string" && current.value.length > maxTextLength) tooLong = true;
    if (Array.isArray(current.value)) {
      for (const item of current.value) pending.push({ value: item, depth: current.depth + 1 });
    } else if (current.value !== null && typeof current.value === "object") {
      for (const item of Object.values(current.value as Record<string, unknown>)) pending.push({ value: item, depth: current.depth + 1 });
    }
  }
  return { depth, nodes, tooLong };
}

const jsonValueSchema: z.ZodType<JsonValue> = z.json().superRefine((value, context) => {
  const metrics = countJsonNodes(value);
  if (metrics.depth > maxJsonDepth) addLimitIssue(context, [], "O valor JSON excede o limite de profundidade.");
  if (metrics.nodes > maxJsonNodes) addLimitIssue(context, [], "O valor JSON excede o limite de itens.");
  if (metrics.tooLong) addLimitIssue(context, [], "Uma string do valor JSON excede o limite permitido.");
});

const lazyRequestSchemaNode = z.lazy(() => requestSchemaNode);
const requestObjectSchema = z.strictObject({
  type: z.literal("object"),
  properties: z.record(z.string().min(1).max(128), lazyRequestSchemaNode),
  required: z.array(z.string().min(1).max(128)).max(64).optional(),
  additionalProperties: z.literal(false),
});
const requestArraySchema = z.strictObject({ type: z.literal("array"), items: lazyRequestSchemaNode });
const requestPrimitiveSchema = z.strictObject({ type: z.enum(["string", "number", "integer", "boolean", "null"]) });
const requestSchemaNode: z.ZodType<WorkflowBuilderJsonSchema> = z.lazy(() => z.union([requestObjectSchema, requestArraySchema, requestPrimitiveSchema])).superRefine((value, context) => {
  const pending: Array<{ node: WorkflowBuilderJsonSchema; depth: number }> = [{ node: value, depth: 1 }];
  let nodes = 0;
  while (pending.length && nodes <= maxRequestSchemaNodes) {
    const current = pending.pop();
    if (!current) break;
    nodes += 1;
    if (current.depth > maxRequestSchemaDepth) addLimitIssue(context, [], "O contrato da requisição excede o limite de profundidade.");
    if (current.node.type === "object") {
      const required = new Set(current.node.required ?? []);
      for (const field of required) if (!Object.hasOwn(current.node.properties, field)) addLimitIssue(context, ["required"], `O campo obrigatório ${field} não existe em properties.`);
      for (const child of Object.values(current.node.properties)) pending.push({ node: child, depth: current.depth + 1 });
    } else if (current.node.type === "array") pending.push({ node: current.node.items, depth: current.depth + 1 });
  }
  if (nodes > maxRequestSchemaNodes) addLimitIssue(context, [], "O contrato da requisição excede o limite de itens.");
});

const referenceValueSchema = z.discriminatedUnion("source", [
  z.strictObject({ kind: z.literal("reference"), source: z.literal("trigger"), path: fieldPathSchema }),
  z.strictObject({ kind: z.literal("reference"), source: z.literal("action"), actionName: nameSchema, path: fieldPathSchema }),
]);
const builderValueSchema: z.ZodType<WorkflowBuilderValue> = z.union([
  z.strictObject({ kind: z.literal("literal"), value: jsonValueSchema }),
  referenceValueSchema,
]);

const authenticationSchema: z.ZodType<WorkflowBuilderAuthentication> = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("none") }),
  z.strictObject({ kind: z.literal("bearer"), parameterName: nameSchema }),
  z.strictObject({ kind: z.literal("header"), headerName: headerNameSchema, parameterName: nameSchema }),
]);

const headersSchema = z.record(headerNameSchema, builderValueSchema).superRefine((headers, context) => {
  if (Object.keys(headers).length > maxHeaders) addLimitIssue(context, [], "Uma action pode ter no máximo 32 headers.");
});

const triggerSchema: z.ZodType<WorkflowBuilderTrigger> = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("Request"), name: nameSchema, requestSchema: requestSchemaNode }),
  z.strictObject({ kind: z.literal("Recurrence"), name: nameSchema, frequency: z.enum(["Second", "Minute", "Hour", "Day", "Week", "Month"]), interval: z.number().int().min(1).max(9999) }),
]);

const httpActionSchema = z.strictObject({
  kind: z.literal("Http"),
  name: nameSchema,
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  uri: z.string().min(1).max(2048),
  headers: headersSchema,
  body: builderValueSchema.optional(),
  responseSchema: requestSchemaNode.optional(),
  authentication: authenticationSchema,
});
const composeActionSchema = z.strictObject({ kind: z.literal("Compose"), name: nameSchema, inputs: builderValueSchema });
const responseActionSchema = z.strictObject({
  kind: z.literal("Response"),
  name: nameSchema,
  statusCode: z.number().int().min(100).max(599),
  headers: headersSchema,
  body: builderValueSchema.optional(),
});

const actionSchema: z.ZodType<WorkflowBuilderAction> = z.discriminatedUnion("kind", [httpActionSchema, composeActionSchema, responseActionSchema]);

export const workflowPlanSchema: z.ZodType<WorkflowPlan> = z.strictObject({
  name: z.string().min(1).max(maxNameLength),
  trigger: triggerSchema,
  actions: z.array(actionSchema).max(maxActions),
});

export const workflowBuilderResultSchema: z.ZodType<WorkflowBuilderResult> = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("needs-input"),
    summary: z.string().min(1).max(maxTextLength),
    questions: z.array(z.string().min(1).max(500)).min(1).max(12),
    assumptions: z.array(z.string().min(1).max(500)).max(12),
    unresolved: z.array(z.string().min(1).max(200)).max(16),
  }),
  z.strictObject({
    status: z.literal("ready"),
    summary: z.string().min(1).max(maxTextLength),
    plan: workflowPlanSchema,
    assumptions: z.array(z.string().min(1).max(500)).max(12),
    warnings: z.array(z.string().min(1).max(500)).max(20),
  }),
]);

export function parseWorkflowBuilderResult(value: unknown): WorkflowBuilderResult {
  return workflowBuilderResultSchema.parse(value);
}
