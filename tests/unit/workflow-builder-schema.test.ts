import { describe, expect, it } from "vitest";

type WorkflowBuilderSchemaModule = {
  workflowBuilderResultSchema: { safeParse(value: unknown): { success: boolean } };
  workflowPlanSchema: { safeParse(value: unknown): { success: boolean } };
};
const schemaLoader = Object.values(import.meta.glob<WorkflowBuilderSchemaModule>("../../src/lib/workflow-builder/schema.ts"))[0];

async function loadSchema(): Promise<WorkflowBuilderSchemaModule> {
  expect(typeof schemaLoader).toBe("function");
  if (typeof schemaLoader !== "function") throw new Error("Workflow builder schema module is not available yet.");
  return schemaLoader();
}

const validPlan = {
  name: "notifyOrder",
  trigger: {
    kind: "Request",
    name: "requestReceived",
    requestSchema: {
      type: "object",
      properties: { orderId: { type: "string" } },
      required: ["orderId"],
      additionalProperties: false,
    },
  },
  actions: [
    {
      kind: "Http",
      name: "sendOrder",
      method: "POST",
      uri: "https://api.example.com/orders",
      headers: {},
      body: { kind: "reference", source: "trigger", path: ["orderId"] },
      authentication: { kind: "none" },
    },
    { kind: "Response", name: "reply", statusCode: 202, headers: {}, body: { kind: "literal", value: { accepted: true } } },
  ],
} as const;

describe("workflow builder result schema", () => {
  it("accepts needs-input without an exportable plan", () => {
    return loadSchema().then(({ workflowBuilderResultSchema }) => workflowBuilderResultSchema.safeParse({
      status: "needs-input",
      summary: "Ainda falta definir a API de destino.",
      questions: ["Qual é a URL HTTPS da API?"],
      assumptions: [],
      unresolved: ["endpoint"],
    })).then(result => {

      expect(result.success).toBe(true);
    });
  });

  it("accepts a ready result only with the typed supported plan", () => {
    return loadSchema().then(({ workflowBuilderResultSchema }) => workflowBuilderResultSchema.safeParse({
      status: "ready",
      summary: "Recebe e encaminha um pedido.",
      plan: validPlan,
      assumptions: [],
      warnings: [],
    })).then(result => {

      expect(result.success).toBe(true);
    });
  });

  it("rejects unknown fields instead of passing model additions through", () => {
    return loadSchema().then(({ workflowBuilderResultSchema }) => workflowBuilderResultSchema.safeParse({
      status: "ready",
      summary: "Workflow.",
      plan: { ...validPlan, modelGeneratedWdl: "@{outputs('run arbitrary expression')}" },
      assumptions: [],
      warnings: [],
    })).then(result => {

      expect(result.success).toBe(false);
    });
  });

  it("rejects unsupported trigger and action kinds", () => {
    return loadSchema().then(({ workflowBuilderResultSchema }) => workflowBuilderResultSchema.safeParse({
      status: "ready",
      summary: "Workflow.",
      plan: { ...validPlan, trigger: { kind: "Webhook", name: "custom", requestSchema: {} }, actions: [{ kind: "ApiConnection", name: "send", connection: "invented" }] },
      assumptions: [],
      warnings: [],
    })).then(result => {

      expect(result.success).toBe(false);
    });
  });

  it("rejects malformed or overbroad request schema nodes", () => {
    const malformedPlan = {
      ...validPlan,
      trigger: { ...validPlan.trigger, requestSchema: { type: "object", properties: { nested: { type: "object" } }, additionalProperties: true } },
    };
    return loadSchema().then(({ workflowBuilderResultSchema }) => workflowBuilderResultSchema.safeParse({ status: "ready", summary: "Workflow.", plan: malformedPlan, assumptions: [], warnings: [] })).then(result => {

      expect(result.success).toBe(false);
    });
  });

  it("rejects invalid result statuses and enum values", () => {
    return loadSchema().then(({ workflowBuilderResultSchema }) => {
    const invalidStatus = workflowBuilderResultSchema.safeParse({ status: "maybe", summary: "Workflow." });
    const invalidMethod = workflowBuilderResultSchema.safeParse({
      status: "ready",
      summary: "Workflow.",
      plan: { ...validPlan, actions: [{ kind: "Http", name: "send", method: "TRACE", uri: "https://api.example.com", headers: {}, authentication: { kind: "none" } }] },
      assumptions: [],
      warnings: [],
    });

      expect(invalidStatus.success).toBe(false);
      expect(invalidMethod.success).toBe(false);
    });
  });

  it.each([0, 10000])("rejects a recurrence interval outside the supported bounds: %i", async interval => {
    const { workflowPlanSchema } = await loadSchema();
    const result = workflowPlanSchema.safeParse({
      name: "Scheduled task",
      trigger: { kind: "Recurrence", name: "schedule", frequency: "Hour", interval },
      actions: [],
    });

    expect(result.success).toBe(false);
  });

  it("accepts named secure auth placeholders and rejects inline credential values", async () => {
    const { workflowBuilderResultSchema } = await loadSchema();
    const plan = {
      ...validPlan,
      actions: [{ kind: "Http", name: "sendOrder", method: "POST", uri: "https://api.example.com/orders", headers: {}, authentication: { kind: "header", headerName: "X-Api-Key", parameterName: "apiKey" } }],
    };
    const accepted = workflowBuilderResultSchema.safeParse({ status: "ready", summary: "Send an order.", plan, assumptions: [], warnings: [] });
    const rejected = workflowBuilderResultSchema.safeParse({
      status: "ready",
      summary: "Send an order.",
      plan: { ...plan, actions: [{ ...plan.actions[0], authentication: { kind: "header", headerName: "X-Api-Key", parameterName: "apiKey", value: "inline-secret" } }] },
      assumptions: [],
      warnings: [],
    });

    expect(accepted.success).toBe(true);
    expect(rejected.success).toBe(false);
  });

  it("rejects invalid HTTP header names", async () => {
    const { workflowBuilderResultSchema } = await loadSchema();
    const result = workflowBuilderResultSchema.safeParse({
      status: "ready",
      summary: "Send an order.",
      plan: { ...validPlan, actions: [{ kind: "Http", name: "sendOrder", method: "POST", uri: "https://api.example.com/orders", headers: { "X Bad": { kind: "literal", value: "value" } }, authentication: { kind: "none" } }] },
      assumptions: [],
      warnings: [],
    });

    expect(result.success).toBe(false);
  });
});
