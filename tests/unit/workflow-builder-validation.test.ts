import { describe, expect, it } from "vitest";
import type { WorkflowPlan, WorkflowPlanValidation } from "@/lib/workflow-builder/types";

type ValidationModule = { validateWorkflowPlan(plan: WorkflowPlan): WorkflowPlanValidation };
const validationLoader = Object.values(import.meta.glob<ValidationModule>("../../src/lib/workflow-builder/validate.ts"))[0];

async function loadValidation(): Promise<ValidationModule> {
  expect(typeof validationLoader).toBe("function");
  if (typeof validationLoader !== "function") throw new Error("Workflow builder validation module is not available yet.");
  return validationLoader();
}

const validPlan: WorkflowPlan = {
  name: "Notify order",
  trigger: {
    kind: "Request",
    name: "requestReceived",
    requestSchema: {
      type: "object",
      properties: {
        orderId: { type: "string" },
        customer: { type: "object", properties: { email: { type: "string" } }, additionalProperties: false },
      },
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
      headers: { "Content-Type": { kind: "literal", value: "application/json" } },
      body: { kind: "reference", source: "trigger", path: ["orderId"] },
      authentication: { kind: "none" },
    },
    { kind: "Response", name: "reply", statusCode: 202, headers: {}, body: { kind: "literal", value: { accepted: true } } },
  ],
};

describe("workflow builder cross-field validation", () => {
  it("accepts an HTTPS request flow with a trigger field reference and terminal response", async () => {
    const { validateWorkflowPlan } = await loadValidation();

    expect(validateWorkflowPlan(validPlan)).toEqual({ valid: true, issues: [] });
  });

  it("rejects duplicate action names because references would be ambiguous", async () => {
    const { validateWorkflowPlan } = await loadValidation();
    const plan: WorkflowPlan = {
      ...validPlan,
      actions: [validPlan.actions[0], { kind: "Compose", name: "sendOrder", inputs: { kind: "literal", value: "duplicate" } }],
    };

    expect(validateWorkflowPlan(plan).issues.map(issue => issue.code)).toContain("duplicate-action-name");
  });

  it.each([
    ["http://api.example.com/orders", "endpoint-not-https"],
    ["https://user:pass@api.example.com/orders", "endpoint-contains-credentials"],
    ["https://api.example.com/orders#section", "endpoint-contains-fragment"],
    ["https://api.example.com/orders?access_token=secret", "endpoint-query-looks-secret"],
    ["https://api.example.com/orders?code=auth-code", "endpoint-query-looks-secret"],
  ])("rejects unsafe endpoint %s", async (uri, issueCode) => {
    const { validateWorkflowPlan } = await loadValidation();
    const plan = structuredClone(validPlan);
    const action = plan.actions[0];
    if (action.kind !== "Http") throw new Error("Fixture must begin with HTTP.");
    action.uri = uri;

    expect(validateWorkflowPlan(plan).issues.map(issue => issue.code)).toContain(issueCode);
  });

  it("allows a benign query parameter whose name only contains the word key", async () => {
    const { validateWorkflowPlan } = await loadValidation();
    const plan = structuredClone(validPlan);
    const action = plan.actions[0];
    if (action.kind !== "Http") throw new Error("Fixture must begin with HTTP.");
    action.uri = "https://api.example.com/orders?monkey=alpha";

    expect(validateWorkflowPlan(plan)).toEqual({ valid: true, issues: [] });
  });

  it("rejects a Response when the trigger is Recurrence", async () => {
    const { validateWorkflowPlan } = await loadValidation();
    const plan: WorkflowPlan = {
      name: "Scheduled report",
      trigger: { kind: "Recurrence", name: "schedule", frequency: "Day", interval: 1 },
      actions: [{ kind: "Response", name: "reply", statusCode: 200, headers: {} }],
    };

    expect(validateWorkflowPlan(plan).issues.map(issue => issue.code)).toContain("response-requires-request-trigger");
  });

  it.each([
    ["unknown field", ["unknown"], "unknown-trigger-reference"],
    ["missing nested field", ["customer", "phone"], "unknown-trigger-reference"],
  ])("rejects a trigger reference to an %s", async (_label, path, issueCode) => {
    const { validateWorkflowPlan } = await loadValidation();
    const plan = structuredClone(validPlan);
    const action = plan.actions[0];
    if (action.kind !== "Http") throw new Error("Fixture must begin with HTTP.");
    action.body = { kind: "reference", source: "trigger", path };

    expect(validateWorkflowPlan(plan).issues.map(issue => issue.code)).toContain(issueCode);
  });

  it("accepts a data reference to a preceding Compose output", async () => {
    const { validateWorkflowPlan } = await loadValidation();
    const plan: WorkflowPlan = {
      name: "Build request",
      trigger: { kind: "Recurrence", name: "schedule", frequency: "Hour", interval: 1 },
      actions: [
        { kind: "Compose", name: "BuildPayload", inputs: { kind: "literal", value: { customer: { id: "A-1" } } } },
        {
          kind: "Http",
          name: "sendPayload",
          method: "POST",
          uri: "https://api.example.com/orders",
          headers: {},
          body: { kind: "reference", source: "action", actionName: "BuildPayload", path: ["customer", "id"] },
          authentication: { kind: "none" },
        },
      ],
    };

    expect(validateWorkflowPlan(plan)).toEqual({ valid: true, issues: [] });
  });

  it("requires an HTTP response contract before referencing one of its fields", async () => {
    const { validateWorkflowPlan } = await loadValidation();
    const plan = {
      name: "Read API response",
      trigger: { kind: "Recurrence", name: "schedule", frequency: "Hour", interval: 1 },
      actions: [
        { kind: "Http", name: "fetchOrder", method: "GET", uri: "https://api.example.com/orders/1", headers: {}, authentication: { kind: "none" } },
        { kind: "Compose", name: "extractOrderId", inputs: { kind: "reference", source: "action", actionName: "fetchOrder", path: ["id"] } },
      ],
    } as WorkflowPlan;

    expect(validateWorkflowPlan(plan).issues.map(issue => issue.code)).toContain("missing-action-response-schema");
  });

  it("validates fields against an earlier HTTP action's declared response contract", async () => {
    const { validateWorkflowPlan } = await loadValidation();
    const plan = {
      name: "Read API response",
      trigger: { kind: "Recurrence", name: "schedule", frequency: "Hour", interval: 1 },
      actions: [
        {
          kind: "Http", name: "fetchOrder", method: "GET", uri: "https://api.example.com/orders/1", headers: {}, authentication: { kind: "none" },
          responseSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
        },
        { kind: "Compose", name: "extractOrderId", inputs: { kind: "reference", source: "action", actionName: "fetchOrder", path: ["id"] } },
      ],
    } as WorkflowPlan;

    expect(validateWorkflowPlan(plan)).toEqual({ valid: true, issues: [] });
  });

  it("rejects fields missing from an earlier HTTP action's response contract", async () => {
    const { validateWorkflowPlan } = await loadValidation();
    const plan = {
      name: "Read API response",
      trigger: { kind: "Recurrence", name: "schedule", frequency: "Hour", interval: 1 },
      actions: [
        {
          kind: "Http", name: "fetchOrder", method: "GET", uri: "https://api.example.com/orders/1", headers: {}, authentication: { kind: "none" },
          responseSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
        },
        { kind: "Compose", name: "extractOrderId", inputs: { kind: "reference", source: "action", actionName: "fetchOrder", path: ["status"] } },
      ],
    } as WorkflowPlan;

    expect(validateWorkflowPlan(plan).issues.map(issue => issue.code)).toContain("unknown-action-response-reference");
  });

  it("rejects a reference to a field absent from a preceding Compose value", async () => {
    const { validateWorkflowPlan } = await loadValidation();
    const plan: WorkflowPlan = {
      name: "Unknown compose field",
      trigger: { kind: "Recurrence", name: "schedule", frequency: "Hour", interval: 1 },
      actions: [
        { kind: "Compose", name: "BuildPayload", inputs: { kind: "literal", value: { customer: { id: "A-1" } } } },
        {
          kind: "Http",
          name: "sendPayload",
          method: "POST",
          uri: "https://api.example.com/orders",
          headers: {},
          body: { kind: "reference", source: "action", actionName: "BuildPayload", path: ["customer", "phone"] },
          authentication: { kind: "none" },
        },
      ],
    };

    expect(validateWorkflowPlan(plan).issues.map(issue => issue.code)).toContain("unknown-compose-reference-path");
  });

  it.each([
    ["missing", "MissingAction", "unknown-action-reference"],
    ["forward", "BuildPayload", "forward-action-reference"],
  ])("rejects a %s action reference", async (_label, actionName, issueCode) => {
    const { validateWorkflowPlan } = await loadValidation();
    const plan: WorkflowPlan = {
      name: "Forward reference",
      trigger: { kind: "Recurrence", name: "schedule", frequency: "Hour", interval: 1 },
      actions: [
        {
          kind: "Compose",
          name: "BuildPayload",
          inputs: { kind: "reference", source: "action", actionName, path: ["id"] },
        },
      ],
    };

    expect(validateWorkflowPlan(plan).issues.map(issue => issue.code)).toContain(issueCode);
  });

  it("rejects WDL expressions smuggled into a field path", async () => {
    const { validateWorkflowPlan } = await loadValidation();
    const plan = structuredClone(validPlan);
    const action = plan.actions[0];
    if (action.kind !== "Http") throw new Error("Fixture must begin with HTTP.");
    action.body = { kind: "reference", source: "trigger", path: ["@outputs('sendOrder')"] };

    expect(validateWorkflowPlan(plan).issues.map(issue => issue.code)).toContain("invalid-reference-path");
  });

  it("rejects credential headers supplied as ordinary values", async () => {
    const { validateWorkflowPlan } = await loadValidation();
    const plan = structuredClone(validPlan);
    const action = plan.actions[0];
    if (action.kind !== "Http") throw new Error("Fixture must begin with HTTP.");
    action.headers.Authorization = { kind: "literal", value: "Bearer inline-secret" };

    expect(validateWorkflowPlan(plan).issues.map(issue => issue.code)).toContain("credential-header-requires-placeholder");
  });

  it("rejects response actions that are not terminal", async () => {
    const { validateWorkflowPlan } = await loadValidation();
    const plan = structuredClone(validPlan);
    plan.actions.push({ kind: "Compose", name: "afterReply", inputs: { kind: "literal", value: "unreachable" } });

    expect(validateWorkflowPlan(plan).issues.map(issue => issue.code)).toContain("response-must-be-last");
  });
});
