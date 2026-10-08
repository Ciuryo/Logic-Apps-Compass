import { describe, expect, it } from "vitest";
import { parseWorkflow } from "@/lib/logic-apps/parser";
import { analyzeWorkflow } from "@/lib/logic-apps/rules";
import type { JsonObject } from "@/types/workflow";
import { explainAction } from "@/lib/logic-apps/explanations";

const analyze = (actions: JsonObject, extra: JsonObject = {}) => analyzeWorkflow(parseWorkflow(JSON.stringify({ triggers: {}, actions, ...extra })));

describe("workflow rule edge cases", () => {
  it("explains unknown types matching object prototype names as ordinary unknown types", () => {
    const workflow = parseWorkflow('{"actions":{"Step":{"type":"__proto__"},"Next":{"type":"toString"}}}');
    for (const action of workflow.actions) {
      expect(typeof explainAction(action)).toBe("string");
      expect(explainAction(action)).toContain("desconhecido");
    }
  });
  it("detects arbitrary token headers and numeric passwords without showing literals", () => {
    const findings = analyze({ Call: { type: "Http", inputs: { headers: { "x-api-key": "SECRET_TEST_MARKER", "x-auth-token": "SECRET_TEST_MARKER" }, body: { password: 9876123 } } } });
    expect(findings.filter((finding) => finding.id.startsWith("secret-literal") || finding.id.startsWith("token-header"))).toHaveLength(3);
    expect(JSON.stringify(findings)).not.toContain("SECRET_TEST_MARKER");
    expect(JSON.stringify(findings)).not.toContain("9876123");
  });
  it("inspects tracked properties and secure defaults in addition to inputs", () => {
    const findings = analyze({ Trace: { type: "Compose", trackedProperties: { password: "SECRET_TEST_MARKER" } } }, { parameters: { Credential: { type: "SecureString", defaultValue: "SECRET_TEST_MARKER" } }, outputs: { person: { type: "Object", value: { email: "private@example.com" } } } });
    expect(findings.some((finding) => finding.workflowPath === "$.actions.Trace.trackedProperties.password")).toBe(true);
    expect(findings.some((finding) => finding.workflowPath === "$.parameters.Credential.defaultValue")).toBe(true);
    expect(findings.some((finding) => finding.id.startsWith("sensitive-data") && finding.workflowPath === "$.outputs.person.value.email")).toBe(true);
    expect(JSON.stringify(findings)).not.toContain("SECRET_TEST_MARKER");
    expect(JSON.stringify(findings)).not.toContain("private@example.com");
  });
  it("uses the parent Scope failure route for its inner HTTP operation", () => {
    const findings = analyze({ Try: { type: "Scope", actions: { Call: { type: "Http", inputs: { uri: "https://example.com" } } } }, Catch: { type: "Scope", runAfter: { Try: ["Failed", "TimedOut"] }, actions: {} } });
    expect(findings.some((finding) => finding.id === "failure-path:$.actions.Try.actions.Call")).toBe(false);
  });
  it("reviews responses waiting for multiple external calls", () => {
    const findings = analyze({ One: { type: "Http", inputs: { uri: "https://example.com/1" } }, Two: { type: "Http", inputs: { uri: "https://example.com/2" }, runAfter: { One: ["Succeeded"] } }, Three: { type: "Http", inputs: { uri: "https://example.com/3" }, runAfter: { Two: ["Succeeded"] } }, Answer: { type: "Response", inputs: { statusCode: 200 }, runAfter: { Three: ["Succeeded"] } } });
    expect(findings.some((finding) => finding.id === "response-chain:$.actions.Answer")).toBe(true);
  });
  it("identifies both deep nesting and invalid dependency statuses", () => {
    let nested: JsonObject = { Step: { type: "Compose", inputs: "ok" } };
    for (let depth = 0; depth < 7; depth++) nested = { Wrap: { type: "Scope", actions: nested } };
    const findings = analyze({ ...nested, Broken: { type: "Compose", runAfter: { Missing: ["UnexpectedStatus"] } } });
    expect(findings.some((finding) => finding.id.startsWith("deep-nesting"))).toBe(true);
    expect(findings.some((finding) => finding.id.startsWith("invalid-dependency-status") && finding.type === "deterministic")).toBe(true);
    expect(findings.some((finding) => finding.id.startsWith("unresolved-dependency") && finding.type === "deterministic")).toBe(true);
  });
  it("does not suggest managed identity for non-Azure or already authenticated destinations", () => {
    const findings = analyze({ Similar: { type: "Http", inputs: { uri: "https://azurewebsites.net.attacker.example/api" } }, Authenticated: { type: "Http", inputs: { uri: "https://example.vault.azure.net/secrets", authentication: { type: "ManagedServiceIdentity" } } } });
    expect(findings.some((finding) => finding.id.startsWith("managed-identity"))).toBe(false);
  });
  it("does not flag a parameter-supplied bearer token as literal", () => {
    const findings = analyze({ Call: { type: "Http", inputs: { headers: { Authorization: "Bearer @{parameters('token')}" } } } });
    expect(findings.some((finding) => finding.id.startsWith("secret-literal"))).toBe(false);
  });
  it("makes deep value inspection limits explicit instead of throwing", () => {
    let value: JsonObject = { password: "SECRET_TEST_MARKER" };
    for (let depth = 0; depth < 60; depth++) value = { nested: value };
    const findings = analyze({ Value: { type: "Compose", inputs: value } });
    expect(findings.some((finding) => finding.id.startsWith("inspection-limit"))).toBe(true);
  });
});
