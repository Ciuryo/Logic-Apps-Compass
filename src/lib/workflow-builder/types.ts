import type { JsonValue } from "@/types/workflow";

export type WorkflowBuilderJsonSchema =
  | { type: "object"; properties: Record<string, WorkflowBuilderJsonSchema>; required?: string[]; additionalProperties: false }
  | { type: "array"; items: WorkflowBuilderJsonSchema }
  | { type: "string" | "number" | "integer" | "boolean" | "null" };

export type WorkflowBuilderTrigger =
  | { kind: "Request"; name: string; requestSchema: WorkflowBuilderJsonSchema }
  | { kind: "Recurrence"; name: string; frequency: "Second" | "Minute" | "Hour" | "Day" | "Week" | "Month"; interval: number };

export type WorkflowBuilderValue =
  | { kind: "literal"; value: JsonValue }
  | { kind: "reference"; source: "trigger"; path: string[] }
  | { kind: "reference"; source: "action"; actionName: string; path: string[] };

export type WorkflowBuilderAuthentication =
  | { kind: "none" }
  | { kind: "bearer"; parameterName: string }
  | { kind: "header"; headerName: string; parameterName: string };

export type WorkflowBuilderAction =
  | { kind: "Http"; name: string; method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; uri: string; headers: Record<string, WorkflowBuilderValue>; body?: WorkflowBuilderValue; responseSchema?: WorkflowBuilderJsonSchema; authentication: WorkflowBuilderAuthentication }
  | { kind: "Compose"; name: string; inputs: WorkflowBuilderValue }
  | { kind: "Response"; name: string; statusCode: number; headers: Record<string, WorkflowBuilderValue>; body?: WorkflowBuilderValue };

export interface WorkflowPlan {
  name: string;
  trigger: WorkflowBuilderTrigger;
  actions: WorkflowBuilderAction[];
}

export interface WorkflowPlanValidationIssue {
  code: string;
  path: Array<string | number>;
  message: string;
}

export interface WorkflowPlanValidation {
  valid: boolean;
  issues: WorkflowPlanValidationIssue[];
}

export type WorkflowBuilderResult =
  | { status: "needs-input"; summary: string; questions: string[]; assumptions: string[]; unresolved: string[] }
  | { status: "ready"; summary: string; plan: WorkflowPlan; assumptions: string[]; warnings: string[] };
