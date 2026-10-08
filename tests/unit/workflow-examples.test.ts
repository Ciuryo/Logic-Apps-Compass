import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { workflowExamples } from "@/content/examples";
import { parseWorkflow } from "@/lib/logic-apps/parser";
import { analyzeWorkflow } from "@/lib/logic-apps/rules";

describe("workflow educational examples", () => {
  it("provides six selectable examples and preserves fixture contents", () => {
    expect(workflowExamples).toHaveLength(6);
    expect(new Set(workflowExamples.map((example) => example.id)).size).toBe(6);
    for (const example of workflowExamples) {
      expect(JSON.parse(readFileSync(`tests/fixtures/workflows/${example.id}.json`, "utf8"))).toEqual(JSON.parse(example.json));
      expect(example.description).toMatch(/educacional/i);
      expect(parseWorkflow(example.json).partial).toBe(false);
    }
  });
  it("covers request, condition, scopes, loops including nested Until and switch", () => {
    const types = new Set(workflowExamples.flatMap((example) => parseWorkflow(example.json).actions.map((action) => action.type)));
    for (const type of ["Request", "If", "Scope", "Foreach", "Until", "Switch"]) expect(types.has(type)).toBe(true);
    expect(analyzeWorkflow(parseWorkflow(workflowExamples.find((example) => example.id === "problematic")!.json)).some((finding) => finding.severity === "critical")).toBe(true);
  });
});
