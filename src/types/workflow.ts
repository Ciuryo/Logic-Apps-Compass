export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;
export interface JsonObject { [key: string]: JsonValue }
export interface DocumentationReference { title: string; url?: string; lastVerifiedAt?: string; pending?: boolean }
export type RunStatus = "Succeeded" | "Failed" | "Skipped" | "TimedOut" | "Cancelled" | "Aborted";
export interface WorkflowAction {
  id: string;
  name: string;
  type: string;
  knownType: boolean;
  path: string;
  parentId?: string;
  branch?: string;
  depth: number;
  isTrigger: boolean;
  runAfter: Record<string, string[]>;
  inputs?: JsonValue;
  outputs?: JsonValue;
  configuration?: JsonValue;
  original: JsonObject;
}
export interface WorkflowDependency { source: string; target: string; statuses: string[]; structural: boolean; label?: string }
export interface WorkflowSummary {
  triggerCount: number; actionCount: number; scopeCount: number; conditionCount: number; loopCount: number;
  maximumDepth: number; actionTypes: string[];
}
export interface ParsedWorkflow {
  name: string;
  hosting: "Standard" | "Consumption" | "Não foi possível determinar";
  original: JsonObject;
  sourceText: string;
  definition: JsonObject;
  definitionPath: string;
  actions: WorkflowAction[];
  dependencies: WorkflowDependency[];
  parameters: JsonObject;
  outputs: JsonObject;
  runtimeConfiguration?: JsonValue;
  summary: WorkflowSummary;
  warnings: string[];
  partial: boolean;
}
export interface Finding {
  id: string; title: string; description: string;
  type: "deterministic" | "heuristic";
  severity: "info" | "warning" | "critical";
  category: "security" | "reliability" | "maintainability" | "observability" | "performance" | "data";
  workflowPath?: string; actionName?: string; evidence?: string;
  whyItMatters: string; recommendation: string;
  confidence: "high" | "medium" | "low";
  documentationReferences: DocumentationReference[];
}
export interface WorkflowGraphNode {
  id: string; position: { x: number; y: number };
  data: { label: string; action: WorkflowAction }; type?: string;
}
export interface WorkflowGraphEdge {
  id: string; source: string; target: string; label?: string;
  data: { statuses: string[]; structural: boolean };
}
export interface WorkflowGraph { nodes: WorkflowGraphNode[]; edges: WorkflowGraphEdge[] }
