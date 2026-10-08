import { describe, expect, it } from "vitest";
import { parseWorkflow, PARSER_LIMITS } from "@/lib/logic-apps/parser";
import { analyzeWorkflow } from "@/lib/logic-apps/rules";
import { buildWorkflowGraph } from "@/lib/logic-apps/graph";
import { explainAction } from "@/lib/logic-apps/explanations";
import type { JsonObject } from "@/types/workflow";

const parse = (actions: JsonObject, extra: JsonObject = {}) => parseWorkflow(JSON.stringify({ triggers: { Start: { type: "Request", kind: "Http" } }, actions, ...extra }));
const nested: JsonObject = {
  Process: { type: "Scope", actions: {
    Check: { type: "If", expression: true, actions: { Same: { type: "Compose", inputs: "yes" } }, else: { actions: { Same: { type: "Compose", inputs: "no" }, Next: { type: "UnknownCustom", runAfter: { Same: ["Failed", "Skipped", "TimedOut"] } } } } },
    Items: { type: "Foreach", actions: { Wait: { type: "Until", actions: { Poll: { type: "Http", inputs: { uri: "https://example.com" } } } } } },
    Route: { type: "Switch", cases: { A: { case: "A", actions: { Same: { type: "Compose" } } } }, default: { actions: { Same: { type: "Compose" } } } }
  } }
};

describe("workflow parser", () => {
  it("preserves original JSON and extracts declared configuration", () => {
    const source = JSON.stringify({ name: "Demo", triggers: {}, actions: { A: { type: "Compose", inputs: { a: 1 }, outputs: "value", runtimeConfiguration: { concurrency: { repetitions: 1 } } } }, parameters: { env: { type: "String" } }, outputs: { result: { type: "String", value: "ok" } }, runtimeConfiguration: { lifetime: "P1D" } });
    const workflow = parseWorkflow(source);
    expect(workflow.sourceText).toBe(source);
    expect(workflow.original).toEqual(JSON.parse(source));
    expect(workflow.name).toBe("Demo");
    expect(workflow.actions[0].configuration).toEqual({ concurrency: { repetitions: 1 } });
    expect(workflow.parameters.env).toEqual({ type: "String" });
    expect(workflow.outputs.result).toBeDefined();
    expect(workflow.runtimeConfiguration).toEqual({ lifetime: "P1D" });
  });
  it.each(["direct", "definition", "properties", "arm"])("accepts %s definition shape", (shape) => {
    const definition = { triggers: {}, actions: { A: { type: "Compose" } } };
    const source = shape === "direct" ? definition : shape === "definition" ? { definition } : shape === "properties" ? { properties: { definition } } : { resources: [{ type: "Microsoft.Logic/workflows", name: "Example", properties: { definition } }] };
    expect(parseWorkflow(JSON.stringify(source)).summary.actionCount).toBe(1);
  });
  it("recurses through all containers with unique exact paths", () => {
    const workflow = parse(nested);
    expect(workflow.summary).toMatchObject({ triggerCount: 1, actionCount: 11, scopeCount: 1, conditionCount: 2, loopCount: 2, maximumDepth: 3 });
    expect(new Set(workflow.actions.map((action) => action.id)).size).toBe(workflow.actions.length);
    expect(workflow.actions.find((action) => action.name === "Poll")?.path).toBe('$.actions.Process.actions.Items.actions.Wait.actions.Poll');
    expect(workflow.actions.find((action) => action.name === "UnknownCustom")).toBeUndefined();
    expect(workflow.actions.find((action) => action.name === "Next")?.knownType).toBe(false);
  });
  it("resolves runAfter only in the local branch and preserves all statuses", () => {
    const workflow = parse(nested);
    const next = workflow.actions.find((action) => action.name === "Next")!;
    const dependencies = workflow.dependencies.filter((dependency) => dependency.target === next.id && !dependency.structural);
    expect(dependencies).toHaveLength(1);
    expect(dependencies[0].source).toBe('$.actions.Process.actions.Check.else.actions.Same');
    expect(dependencies[0].statuses).toEqual(["Failed", "Skipped", "TimedOut"]);
  });
  it("warns when a dependency references a sibling branch", () => {
    const workflow = parse({ C: { type: "If", actions: { Local: { type: "Compose" } }, else: { actions: { Other: { type: "Compose", runAfter: { Local: ["Succeeded"] } } } } } });
    expect(workflow.dependencies.some((edge) => !edge.structural)).toBe(false);
    expect(workflow.warnings.join(" ")).toContain("dependência");
  });
  it("escapes unusual JSON keys without ambiguous paths", () => {
    expect(parse({ "name.with.dots": { type: "Compose" } }).actions.at(-1)?.path).toBe('$.actions["name.with.dots"]');
  });
  it("does not guess hosting from a definition schema or kind", () => {
    expect(parse({}, { kind: "Stateful", $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#" }).hosting).toBe("Não foi possível determinar");
    expect(parseWorkflow(JSON.stringify({ type: "Microsoft.Logic/workflows", properties: { definition: { triggers: {}, actions: {} } } })).hosting).toBe("Consumption");
    expect(parseWorkflow(JSON.stringify({ type: "Microsoft.Web/sites", kind: "functionapp,workflowapp", properties: { definition: { triggers: {}, actions: {} } } })).hosting).toBe("Standard");
  });
  it.each(["[]", "null", '"text"', "{}", '{"actions":[]}', '{"actions":{},"triggers":[]}'])("rejects non-workflow input %s", (source) => {
    expect(() => parseWorkflow(source)).toThrow(/workflow|objeto|actions|triggers/i);
  });
  it("never echoes sensitive contents in malformed JSON errors", () => {
    try { parseWorkflow('{"secret":"sensitive-marker",'); } catch (error) {
      expect((error as Error).message).not.toContain("sensitive-marker");
      expect((error as Error).message).toContain("JSON");
    }
  });
  it("rejects content larger than the byte limit", () => {
    expect(() => parseWorkflow("á".repeat(PARSER_LIMITS.maxInputBytes))).toThrow(/2 MB/);
  });
  it("returns an explicit partial state when depth is excessive", () => {
    let actions: JsonObject = { Last: { type: "Compose" } };
    for (let index = 0; index < PARSER_LIMITS.maxDepth + 3; index++) actions = { Scope: { type: "Scope", actions } };
    const workflow = parse(actions);
    expect(workflow.partial).toBe(true);
    expect(workflow.warnings.join(" ")).toMatch(/profundidade/i);
  });
  it("returns an explicit partial state when node count is excessive", () => {
    const actions = Object.fromEntries(Array.from({ length: PARSER_LIMITS.maxNodes + 3 }, (_, index) => [`A${index}`, { type: "Compose" }]));
    const workflow = parse(actions);
    expect(workflow.partial).toBe(true);
    expect(workflow.actions.length).toBeLessThanOrEqual(PARSER_LIMITS.maxNodes);
  });
  it("keeps valid siblings when an action has malformed contents", () => {
    const workflow = parse({ Broken: "invalid", Valid: { type: "Compose" } });
    expect(workflow.partial).toBe(true);
    expect(workflow.actions.some((action) => action.name === "Valid")).toBe(true);
  });
  it.each<JsonObject>([
    { type: "If", actions: {}, else: [] },
    { type: "Condition", actions: {}, else: null },
    { type: "Switch", cases: {}, default: "invalid" },
    { type: "Switch", cases: {}, default: [] }
  ])("marks malformed branch containers as partial: %j", (container) => {
    const workflow = parse({ Branch: container, Valid: { type: "Compose" } });
    expect(workflow.partial).toBe(true);
    expect(workflow.warnings.some((warning) => warning.includes("$.actions.Branch."))).toBe(true);
    expect(workflow.actions.some((action) => action.name === "Valid")).toBe(true);
  });
  it.each<JsonObject>([
    { type: "If", actions: {}, else: {} },
    { type: "If", actions: {}, else: { actions: [] } },
    { type: "Switch", cases: { Option: { case: "option" } } },
    { type: "Switch", cases: { Option: { case: "option", actions: null } } },
    { type: "Switch", cases: {}, default: {} },
    { type: "Switch", cases: {}, default: { actions: "invalid" } }
  ])("marks missing or invalid child actions in a present branch as partial: %j", (container) => {
    const workflow = parse({ Branch: container });
    expect(workflow.partial).toBe(true);
    expect(workflow.warnings.join(" ")).toContain("actions");
    expect(workflow.warnings.join(" ")).toContain("$.actions.Branch");
  });
  it("accepts explicitly empty branch actions and omitted optional else/default", () => {
    const workflow = parse({
      EmptyElse: { type: "If", actions: {}, else: { actions: {} } },
      NoElse: { type: "If", actions: {} },
      EmptySwitch: { type: "Switch", cases: { Empty: { case: "empty", actions: {} } }, default: { actions: {} } },
      NoDefault: { type: "Switch", cases: {} }
    });
    expect(workflow.partial).toBe(false);
    expect(workflow.warnings).toEqual([]);
  });
});

describe("workflow graph and explanations", () => {
  it("connects root triggers and nested containers with structural edges", () => {
    const workflow = parse(nested);
    const graph = buildWorkflowGraph(workflow);
    expect(graph.nodes).toHaveLength(workflow.actions.length);
    expect(graph.edges.some((edge) => edge.source === "$.triggers.Start" && edge.target === "$.actions.Process")).toBe(true);
    expect(graph.edges.some((edge) => edge.source === "$.actions.Process" && edge.target === "$.actions.Process.actions.Check")).toBe(true);
    expect(new Set(graph.nodes.map((node) => `${node.position.x}:${node.position.y}`)).size).toBe(graph.nodes.length);
    expect(graph.edges.every((edge) => graph.nodes.some((node) => node.id === edge.source) && graph.nodes.some((node) => node.id === edge.target))).toBe(true);
  });
  it("explains supported actions and honestly preserves unknown types", () => {
    const workflow = parse({ A: { type: "Http" }, B: { type: "VendorCustom" } });
    expect(explainAction(workflow.actions[1])).toMatch(/HTTP/);
    expect(explainAction(workflow.actions[2])).toMatch(/VendorCustom|desconhecido/);
  });
});

describe("workflow rules", () => {
  it("detects hardcoded secrets with exact paths and safe evidence", () => {
    const workflow = parse({ HTTP_2: { type: "Http", inputs: { uri: "http://api.example.com/path?sig=secret-marker", headers: { Authorization: "Bearer secret-marker", "Ocp-Apim-Subscription-Key": "secret-marker", "x-functions-key": "secret-marker" }, body: { client_secret: "secret-marker", password: "secret-marker", connectionString: "AccountKey=secret-marker" } } } });
    const findings = analyzeWorkflow(workflow);
    expect(findings.filter((finding) => finding.category === "security").length).toBeGreaterThanOrEqual(7);
    expect(findings.some((finding) => finding.workflowPath === "$.actions.HTTP_2.inputs.headers.Authorization" && finding.type === "deterministic")).toBe(true);
    expect(JSON.stringify(findings)).not.toContain("secret-marker");
    expect(findings.every((finding) => finding.recommendation && finding.whyItMatters && finding.evidence && finding.documentationReferences.length)).toBe(true);
  });
  it("does not flag parameter expressions as hardcoded secrets", () => {
    const findings = analyzeWorkflow(parse({ Call: { type: "Http", inputs: { uri: "https://example.com", headers: { Authorization: "@parameters('authorization')" }, retryPolicy: { type: "exponential" } } } }));
    expect(findings.some((finding) => finding.id.startsWith("secret-literal"))).toBe(false);
    expect(findings.some((finding) => finding.id.startsWith("http-retry"))).toBe(false);
  });
  it("classifies heuristic recommendations honestly and finds reliability issues", () => {
    const findings = analyzeWorkflow(parse({ HTTP_2: { type: "Http", inputs: { uri: "https://demo.azurewebsites.net/api" } }, Repeat: { type: "Until", actions: {} }, Answer: { type: "Response", inputs: { statusCode: 500 } } }));
    for (const prefix of ["http-retry", "failure-path", "managed-identity", "loop-risk", "generic-name", "correlation-id", "error-context"]) expect(findings.some((finding) => finding.id.startsWith(prefix))).toBe(true);
    expect(findings.filter((finding) => finding.type === "heuristic").every((finding) => finding.confidence !== "high")).toBe(true);
  });
  it("recognizes an explicit failure route in the same local scope", () => {
    const findings = analyzeWorkflow(parse({ Work: { type: "Http", inputs: { uri: "https://example.com", retryPolicy: { type: "fixed" } } }, Catch: { type: "Scope", runAfter: { Work: ["Failed", "TimedOut"] }, actions: { Trace: { type: "Compose", inputs: "@result('Work')" } } } }));
    expect(findings.some((finding) => finding.id === "failure-path:$.actions.Work")).toBe(false);
    expect(findings.some((finding) => finding.id.startsWith("central-error"))).toBe(false);
  });
  it("finds duplicate actions, endpoints and large logic while never mutating original", () => {
    const actions: JsonObject = {};
    for (let index = 0; index < 25; index++) actions[`Call${index}`] = { type: "Http", inputs: { uri: "https://prod.example.com/api", body: { environment: "production" } } };
    const workflow = parse(actions);
    const before = JSON.stringify(workflow.original);
    const findings = analyzeWorkflow(workflow);
    for (const prefix of ["repeated-endpoint", "duplicate-action", "large-block", "environment-value"]) expect(findings.some((finding) => finding.id.startsWith(prefix))).toBe(true);
    expect(JSON.stringify(workflow.original)).toBe(before);
  });
});
