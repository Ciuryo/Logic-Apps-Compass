import { describe, expect, it } from "vitest";
import { parseWorkflow } from "@/lib/logic-apps/parser";
import type { WorkflowPlan } from "@/lib/workflow-builder/types";

type WorkflowBuilderGeneratorModule = {
  generateWorkflowArtifacts(plan: WorkflowPlan): {
    workflowDefinition: string;
    armTemplate: string;
    readme: string;
  };
  validateGeneratedWorkflow(artifacts: {
    workflowDefinition: string;
    armTemplate: string;
    readme: string;
  }): {
    valid: boolean;
    issues: Array<{ code: string; path: Array<string | number>; message: string }>;
  };
};

type WorkflowBuilderValidatorModule = Pick<WorkflowBuilderGeneratorModule, "validateGeneratedWorkflow">;
const generatorLoader = Object.values(import.meta.glob<WorkflowBuilderGeneratorModule>("../../src/lib/workflow-builder/generate.ts"))[0];
const validatorLoader = Object.values(import.meta.glob<WorkflowBuilderValidatorModule>("../../src/lib/workflow-builder/validate-generated.ts"))[0];

async function loadGenerator(): Promise<WorkflowBuilderGeneratorModule> {
  expect(typeof generatorLoader).toBe("function");
  expect(typeof validatorLoader).toBe("function");
  if (typeof generatorLoader !== "function" || typeof validatorLoader !== "function") throw new Error("Workflow builder artifact modules are not available yet.");
  const [generator, validator] = await Promise.all([generatorLoader(), validatorLoader()]);
  return { ...generator, ...validator };
}

function withWorkflowDefinition(
  artifacts: { workflowDefinition: string; armTemplate: string; readme: string },
  edit: (definition: Record<string, unknown>) => void,
): { workflowDefinition: string; armTemplate: string; readme: string } {
  const definition = JSON.parse(artifacts.workflowDefinition) as Record<string, unknown>;
  edit(definition);
  const arm = JSON.parse(artifacts.armTemplate) as Record<string, unknown>;
  const resources = arm.resources as Array<Record<string, unknown>>;
  const resource = resources[0];
  const properties = resource?.properties as Record<string, unknown>;
  if (!properties) throw new Error("Fixture must have a Logic Apps resource.");
  properties.definition = definition;
  return { ...artifacts, workflowDefinition: JSON.stringify(definition), armTemplate: JSON.stringify(arm) };
}

const requestPlan: WorkflowPlan = {
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
      body: { kind: "reference", source: "trigger", path: ["customer", "email"] },
      responseSchema: { type: "object", properties: { accepted: { type: "boolean" } }, additionalProperties: false },
      authentication: { kind: "none" },
    },
    {
      kind: "Response",
      name: "reply",
      statusCode: 202,
      headers: {},
      body: { kind: "reference", source: "action", actionName: "sendOrder", path: ["accepted"] },
    },
  ],
};

const recurrencePlan: WorkflowPlan = {
  name: "Daily health check",
  trigger: { kind: "Recurrence", name: "schedule", frequency: "Day", interval: 1 },
  actions: [
    {
      kind: "Http",
      name: "checkStatus",
      method: "GET",
      uri: "https://status.example.com/health",
      headers: {},
      authentication: { kind: "none" },
    },
  ],
};

describe("workflow builder artifact generation", () => {
  it("generates a Request to HTTP to Response workflow with typed expressions and sequential runAfter", async () => {
    const { generateWorkflowArtifacts, validateGeneratedWorkflow } = await loadGenerator();
    const artifacts = generateWorkflowArtifacts(requestPlan);
    const parsed = parseWorkflow(artifacts.workflowDefinition);
    const actions = parsed.actions.filter((action) => !action.isTrigger);

    expect(parsed.definition.triggers).toMatchObject({
      requestReceived: { type: "Request", kind: "Http", inputs: { schema: requestPlan.trigger.kind === "Request" ? requestPlan.trigger.requestSchema : {} } },
    });
    expect(actions.map((action) => action.name)).toEqual(["sendOrder", "reply"]);
    expect(actions[0]?.runAfter).toEqual({});
    expect(actions[1]?.runAfter).toEqual({ sendOrder: ["Succeeded"] });
    expect(artifacts.workflowDefinition).toContain("@triggerBody()?['customer']?['email']");
    expect(artifacts.workflowDefinition).toContain("@body('sendOrder')?['accepted']");
    expect(validateGeneratedWorkflow(artifacts)).toEqual({ valid: true, issues: [] });
  });

  it("generates a Recurrence trigger and sequential HTTP action", async () => {
    const { generateWorkflowArtifacts } = await loadGenerator();
    const artifacts = generateWorkflowArtifacts(recurrencePlan);
    const parsed = parseWorkflow(artifacts.workflowDefinition);

    expect(parsed.definition.triggers).toMatchObject({
      schedule: { type: "Recurrence", recurrence: { frequency: "Day", interval: 1 } },
    });
    expect(parsed.actions.find((action) => action.name === "checkStatus")?.runAfter).toEqual({});
  });

  it("uses typed array-index and numeric-object-key syntax for schema references", async () => {
    const { generateWorkflowArtifacts } = await loadGenerator();
    const plan: WorkflowPlan = {
      name: "Forward item values",
      trigger: {
        kind: "Request",
        name: "incoming",
        requestSchema: {
          type: "object",
          properties: {
            items: { type: "array", items: { type: "object", properties: { recordId: { type: "string" } }, additionalProperties: false } },
            "0": { type: "string" },
          },
          additionalProperties: false,
        },
      },
      actions: [{
        kind: "Http",
        name: "forwardItem",
        method: "POST",
        uri: "https://api.example.com/items",
        headers: { "X-Number": { kind: "reference", source: "trigger", path: ["0"] } },
        body: { kind: "reference", source: "trigger", path: ["items", "0", "recordId"] },
        authentication: { kind: "none" },
      }],
    };

    const artifacts = generateWorkflowArtifacts(plan);

    expect(artifacts.workflowDefinition).toContain("@triggerBody()?['items']?[0]?['recordId']");
    expect(artifacts.workflowDefinition).toContain(`"X-Number": "@triggerBody()?['0']"`);
  });

  it("preserves JSON literals and emits the Consumption ARM resource envelope", async () => {
    const { generateWorkflowArtifacts } = await loadGenerator();
    const plan: WorkflowPlan = {
      name: "Create summary",
      trigger: requestPlan.trigger,
      actions: [{ kind: "Compose", name: "summary", inputs: { kind: "literal", value: { source: "manual", active: true, count: 3, empty: null } } }],
    };
    const artifacts = generateWorkflowArtifacts(plan);

    expect(artifacts.workflowDefinition).toContain('"source": "manual"');
    expect(artifacts.workflowDefinition).toContain('"active": true');
    expect(JSON.parse(artifacts.armTemplate)).toMatchObject({
      $schema: "https://schema.management.azure.com/schemas/2015-01-01/deploymentTemplate.json#",
      contentVersion: "1.0.0.0",
      parameters: {
        workflowName: { type: "string", minLength: 1, maxLength: 80 },
        location: { type: "string", defaultValue: "[resourceGroup().location]" },
      },
      resources: [{
        type: "Microsoft.Logic/workflows",
        apiVersion: "2019-05-01",
        name: "[parameters('workflowName')]",
        location: "[parameters('location')]",
        properties: { state: "Enabled", definition: JSON.parse(artifacts.workflowDefinition) },
      }],
      outputs: {},
    });
  });

  it("keeps artifact formatting deterministic for the same reviewed plan", async () => {
    const { generateWorkflowArtifacts } = await loadGenerator();

    expect(generateWorkflowArtifacts(requestPlan)).toEqual(generateWorkflowArtifacts(requestPlan));
    expect(generateWorkflowArtifacts(requestPlan).workflowDefinition.endsWith("\n")).toBe(false);
  });

  it("escapes literal strings that could otherwise be interpreted as WDL expressions", async () => {
    const { generateWorkflowArtifacts } = await loadGenerator();
    const plan: WorkflowPlan = {
      name: "Keep literal text",
      trigger: recurrencePlan.trigger,
      actions: [{
        kind: "Compose",
        name: "literalText",
        inputs: { kind: "literal", value: { startsWithAt: "@triggerBody()", interpolation: "value @{triggerBody()}", email: "person@example.com" } },
      }],
    };

    const artifacts = generateWorkflowArtifacts(plan);

    expect(artifacts.workflowDefinition).toContain('"startsWithAt": "@@triggerBody()"');
    expect(artifacts.workflowDefinition).toContain('"interpolation": "value @@{triggerBody()}"');
    expect(artifacts.workflowDefinition).toContain('"email": "person@example.com"');
  });

  it("wires bearer and named-header credentials through secure placeholders only", async () => {
    const { generateWorkflowArtifacts } = await loadGenerator();
    const plan: WorkflowPlan = {
      ...recurrencePlan,
      actions: [
        {
          kind: "Http",
          name: "sendBearer",
          method: "POST",
          uri: "https://api.example.com/bearer",
          headers: {},
          body: { kind: "literal", value: { ok: true } },
          authentication: { kind: "bearer", parameterName: "accessToken" },
        },
        {
          kind: "Http",
          name: "sendKey",
          method: "GET",
          uri: "https://api.example.com/key",
          headers: {},
          authentication: { kind: "header", headerName: "x-api-key", parameterName: "serviceKey" },
        },
      ],
    };
    const artifacts = generateWorkflowArtifacts(plan);
    const workflow = JSON.parse(artifacts.workflowDefinition) as Record<string, unknown>;
    const definitionParameters = workflow.parameters as Record<string, Record<string, unknown>>;
    const actions = workflow.actions as Record<string, Record<string, unknown>>;
    const bearerInputs = actions.sendBearer?.inputs as Record<string, unknown>;
    const bearerAuth = bearerInputs.authentication as Record<string, unknown>;
    const keyInputs = actions.sendKey?.inputs as Record<string, unknown>;
    const arm = JSON.parse(artifacts.armTemplate) as Record<string, unknown>;
    const armParameters = arm.parameters as Record<string, Record<string, unknown>>;
    const resource = (arm.resources as Array<Record<string, unknown>>)[0];
    const properties = resource?.properties as Record<string, unknown>;
    const workflowParameterValues = properties.parameters as Record<string, Record<string, unknown>>;
    const allArtifacts = `${artifacts.workflowDefinition}\n${artifacts.armTemplate}\n${artifacts.readme}`;

    expect(bearerAuth).toEqual({ type: "Raw", value: "@{concat('Bearer ', parameters('accessToken'))}" });
    expect(keyInputs.headers).toEqual({ "x-api-key": "@parameters('serviceKey')" });
    expect(actions.sendBearer?.runtimeConfiguration).toEqual({ secureData: { properties: ["inputs", "outputs"] } });
    expect(actions.sendKey?.runtimeConfiguration).toEqual({ secureData: { properties: ["inputs", "outputs"] } });
    expect(definitionParameters).toEqual({ accessToken: { type: "securestring" }, serviceKey: { type: "securestring" } });
    expect(armParameters.auth_accessToken).toEqual({ type: "securestring" });
    expect(armParameters.auth_serviceKey).toEqual({ type: "securestring" });
    expect(workflowParameterValues.accessToken).toEqual({ value: "[parameters('auth_accessToken')]" });
    expect(workflowParameterValues.serviceKey).toEqual({ value: "[parameters('auth_serviceKey')]" });
    expect(allArtifacts).not.toContain("credential-value");
    expect(definitionParameters.accessToken).not.toHaveProperty("defaultValue");
    expect(definitionParameters.serviceKey).not.toHaveProperty("defaultValue");
    expect(armParameters.auth_accessToken).not.toHaveProperty("defaultValue");
    expect(armParameters.auth_serviceKey).not.toHaveProperty("defaultValue");
  });

  it("deduplicates a shared secure credential parameter across actions", async () => {
    const { generateWorkflowArtifacts } = await loadGenerator();
    const plan: WorkflowPlan = {
      ...recurrencePlan,
      actions: recurrencePlan.actions.map((action) => action.kind === "Http" ? { ...action, authentication: { kind: "bearer", parameterName: "sharedToken" } } : action),
    };
    plan.actions.push({
      kind: "Http",
      name: "checkAnother",
      method: "GET",
      uri: "https://status.example.com/other",
      headers: {},
      authentication: { kind: "bearer", parameterName: "sharedToken" },
    });
    const artifacts = generateWorkflowArtifacts(plan);

    expect((artifacts.workflowDefinition.match(/"sharedToken"\s*:/g) ?? [])).toHaveLength(1);
    expect((artifacts.armTemplate.match(/"auth_sharedToken"\s*:/g) ?? [])).toHaveLength(1);
  });

  it("blocks case-colliding secure parameter names and duplicate authentication headers", async () => {
    const { generateWorkflowArtifacts } = await loadGenerator();
    const plan: WorkflowPlan = {
      ...recurrencePlan,
      actions: [
        {
          kind: "Http",
          name: "firstCall",
          method: "GET",
          uri: "https://api.example.com/one",
          headers: {},
          authentication: { kind: "bearer", parameterName: "serviceToken" },
        },
        {
          kind: "Http",
          name: "secondCall",
          method: "GET",
          uri: "https://api.example.com/two",
          headers: { "X-CUSTOM-AUTH": { kind: "literal", value: "ordinary" } },
          authentication: { kind: "header", headerName: "x-custom-auth", parameterName: "serviceKey" },
        },
        {
          kind: "Http",
          name: "thirdCall",
          method: "GET",
          uri: "https://api.example.com/three",
          headers: {},
          authentication: { kind: "header", headerName: "x-api-key", parameterName: "servicetoken" },
        },
      ],
    };

    expect(() => generateWorkflowArtifacts(plan)).toThrowError(/inválido/i);
  });

  it("blocks Response status codes that Azure Logic Apps does not support", async () => {
    const { generateWorkflowArtifacts } = await loadGenerator();
    const plan = structuredClone(requestPlan);
    const response = plan.actions[1];
    if (response?.kind !== "Response") throw new Error("Fixture must end with Response.");
    response.statusCode = 302;

    expect(() => generateWorkflowArtifacts(plan)).toThrowError(/inválido/i);
  });

  it("blocks credential-like literal values instead of writing them into downloadable files", async () => {
    const { generateWorkflowArtifacts } = await loadGenerator();
    const plan: WorkflowPlan = {
      ...recurrencePlan,
      actions: [{
        kind: "Compose",
        name: "unsafeLiteral",
        inputs: { kind: "literal", value: { Authorization: "Bearer credential-value" } },
      }],
    };

    expect(() => generateWorkflowArtifacts(plan)).toThrowError(/credencial/i);
  });

  it("rejects an invalid plan without returning partial artifacts or echoing its endpoint", async () => {
    const { generateWorkflowArtifacts } = await loadGenerator();
    const plan = structuredClone(recurrencePlan);
    const action = plan.actions[0];
    if (action?.kind !== "Http") throw new Error("Fixture must begin with HTTP.");
    action.uri = "http://private.example.com/?token=do-not-echo-this";

    let thrown: unknown;
    try {
      generateWorkflowArtifacts(plan);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    if (thrown instanceof Error) {
      expect(thrown.message).toMatch(/plano.*inválido/i);
      expect(thrown.message).not.toContain("do-not-echo-this");
      expect(thrown.message).not.toContain("private.example.com");
    }
  });

  it("does not mutate the caller's plan while generating artifacts", async () => {
    const { generateWorkflowArtifacts } = await loadGenerator();
    const plan = structuredClone(requestPlan);
    const before = JSON.stringify(plan);

    generateWorkflowArtifacts(plan);

    expect(JSON.stringify(plan)).toBe(before);
  });

  it("returns diagnostics when generated WDL is malformed or semantically outside the supported subset", async () => {
    const { generateWorkflowArtifacts, validateGeneratedWorkflow } = await loadGenerator();
    const valid = generateWorkflowArtifacts(recurrencePlan);

    expect(validateGeneratedWorkflow({ ...valid, workflowDefinition: "{" }).issues.map((item) => item.code)).toContain("invalid-workflow-definition");
    expect(validateGeneratedWorkflow({
      ...valid,
      workflowDefinition: JSON.stringify({ triggers: { schedule: { type: "Recurrence" } }, actions: { nested: { type: "If", actions: {} } } }),
    }).issues.map((item) => item.code)).toContain("unsupported-workflow-shape");
  });

  it("rejects a Response status code outside the Azure-supported ranges during generated validation", async () => {
    const { generateWorkflowArtifacts, validateGeneratedWorkflow } = await loadGenerator();
    const artifacts = generateWorkflowArtifacts(requestPlan);
    const invalid = withWorkflowDefinition(artifacts, (definition) => {
      const actions = definition.actions as Record<string, Record<string, unknown>>;
      const response = actions.reply;
      const inputs = response?.inputs as Record<string, unknown>;
      if (!inputs) throw new Error("Fixture must contain Response inputs.");
      inputs.statusCode = 302;
    });

    expect(validateGeneratedWorkflow(invalid).issues.map((item) => item.code)).toContain("invalid-response-status");
  });

  it("requires secure data on authenticated actions and a valid ARM envelope", async () => {
    const { generateWorkflowArtifacts, validateGeneratedWorkflow } = await loadGenerator();
    const plan: WorkflowPlan = {
      ...recurrencePlan,
      actions: [{
        kind: "Http",
        name: "secureCall",
        method: "GET",
        uri: "https://api.example.com/secure",
        headers: {},
        authentication: { kind: "bearer", parameterName: "accessToken" },
      }],
    };
    const artifacts = generateWorkflowArtifacts(plan);
    const withoutSecureOutputs = withWorkflowDefinition(artifacts, (definition) => {
      const actions = definition.actions as Record<string, Record<string, unknown>>;
      const secureCall = actions.secureCall;
      const runtimeConfiguration = secureCall?.runtimeConfiguration as Record<string, unknown>;
      const secureData = runtimeConfiguration.secureData as Record<string, unknown>;
      secureData.properties = ["inputs"];
    });

    expect(validateGeneratedWorkflow(withoutSecureOutputs).issues.map((item) => item.code)).toContain("missing-secure-data");
    expect(validateGeneratedWorkflow({ ...artifacts, armTemplate: "{}" }).issues.map((item) => item.code)).toContain("invalid-arm-template");
  });
});
