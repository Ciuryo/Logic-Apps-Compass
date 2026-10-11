import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkflowPlan } from "@/lib/workflow-builder/types";

type WorkflowBuilderRoute = { POST(request: Request): Promise<Response> };
const routeLoader = Object.values(import.meta.glob<WorkflowBuilderRoute>("../../src/app/api/workflow-builder/route.ts"))[0];

async function loadRoute(): Promise<WorkflowBuilderRoute> {
  expect(typeof routeLoader).toBe("function");
  if (typeof routeLoader !== "function") throw new Error("Workflow builder route is not available yet.");
  return routeLoader();
}

const needsInput = {
  status: "needs-input",
  summary: "Faltam detalhes da API.",
  questions: ["Qual endpoint HTTPS deve receber o pedido?"],
  assumptions: [],
  unresolved: ["endpoint", "método"],
};

const readyResult = {
  status: "ready",
  summary: "Recebe um pedido e encaminha o identificador.",
  plan: {
    name: "Forward order",
    trigger: {
      kind: "Request",
      name: "requestReceived",
      requestSchema: { type: "object", properties: { orderId: { type: "string" } }, required: ["orderId"], additionalProperties: false },
    },
    actions: [{
      kind: "Http",
      name: "sendOrder",
      method: "POST",
      uri: "https://api.example.com/orders",
      headers: { "Content-Type": { kind: "literal", value: "application/json" } },
      body: { kind: "reference", source: "trigger", path: ["orderId"] },
      authentication: { kind: "none" },
    }],
  } satisfies WorkflowPlan,
  assumptions: [],
  warnings: [],
};

function answerPayload(answer: string): unknown {
  return { output: [{ type: "message", content: [{ type: "output_text", text: answer }] }] };
}

function requestBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    message: "Encaminhe pedidos novos.",
    context: "",
    provider: "openai",
    consent: true,
    ...overrides,
  };
}

async function post(body: unknown): Promise<Response> {
  const { POST } = await loadRoute();
  return POST(new Request("http://localhost/api/workflow-builder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

async function postRaw(body: string, contentType = "application/json"): Promise<Response> {
  const { POST } = await loadRoute();
  return POST(new Request("http://localhost/api/workflow-builder", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body,
  }));
}

function configureOpenAi(answer: string): ReturnType<typeof vi.fn> {
  vi.stubEnv("OPENAI_API_KEY", "server-provider-secret");
  vi.stubEnv("OPENAI_MODEL", "configured-model");
  const fetchSpy = vi.fn(async () => Response.json(answerPayload(answer)));
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("workflow builder consent-gated API", () => {
  it.each([undefined, false, "true"])("requires literal consent before contacting a provider (%s)", async (consent) => {
    const fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy);
    const response = await post(requestBody({ consent }));

    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects absent provider and unknown fields before external fetch", async () => {
    const fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy);
    const absentProvider = await post({ message: "Pedido", context: "", consent: true });
    const extraField = await post(requestBody({ unexpected: "private-value" }));

    expect(absentProvider.status).toBe(400);
    expect(extraField.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects unknown provider IDs and Mock for personalized generation", async () => {
    const fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy);
    const unknown = await post(requestBody({ provider: "another-provider" }));
    const mock = await post(requestBody({ provider: "mock" }));

    expect(unknown.status).toBe(400);
    expect(mock.status).toBe(400);
    expect(await mock.text()).not.toMatch(/answer|plano personalizado/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects an unconfigured provider before fetch", async () => {
    vi.stubEnv("OPENAI_API_KEY", ""); vi.stubEnv("OPENAI_MODEL", "");
    const fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy);

    const response = await post(requestBody());

    expect(response.status).toBe(503);
    expect(await response.text()).not.toMatch(/server-provider-secret|private-resource/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks oversized content even when Content-Length is missing", async () => {
    const fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy);
    const response = await postRaw("x".repeat(350001));

    expect(response.status).toBe(413);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("requires JSON content type", async () => {
    const fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy);
    const response = await postRaw("{}", "text/plain");

    expect(response.status).toBe(415);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns a validated needs-input result without exposing raw model text", async () => {
    const fetchSpy = configureOpenAi(JSON.stringify(needsInput));
    const response = await post(requestBody());
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toEqual({ result: needsInput, provider: "OpenAI" });
    expect(text).not.toContain('"answer"');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("returns a structurally and semantically validated ready plan", async () => {
    const fetchSpy = configureOpenAi(JSON.stringify(readyResult));
    const response = await post(requestBody());

    expect(response.status, await response.clone().text()).toBe(200);
    expect(await response.json()).toEqual({ result: readyResult, provider: "OpenAI" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("blocks a ready result whose endpoint fails local plan validation", async () => {
    const unsafeResult = structuredClone(readyResult);
    unsafeResult.plan.actions[0]!.uri = "http://api.example.com/orders";
    configureOpenAi(JSON.stringify(unsafeResult));

    const response = await post(requestBody());
    const text = await response.text();

    expect(response.status).toBe(502);
    expect(text).not.toContain("http://api.example.com/orders");
  });

  it.each([
    ["malformed JSON", "{not-json"],
    ["truncated JSON", '{"status":"ready",'],
    ["extra result property", JSON.stringify({ ...needsInput, answer: "unexpected" })],
    ["unsupported action", JSON.stringify({ ...readyResult, plan: { ...readyResult.plan, actions: [{ kind: "DeleteEverything", name: "unsafe" }] } })],
  ])("rejects %s output without echoing untrusted content", async (_label, answer) => {
    configureOpenAi(answer);
    const response = await post(requestBody());
    const text = await response.text();

    expect(response.status).toBe(502);
    expect(text).not.toContain(answer);
    expect(text).not.toContain("server-provider-secret");
  });

  it("rejects credentials detected in model output instead of packaging a redacted plan", async () => {
    const unsafe = JSON.stringify({ ...needsInput, summary: "Authorization: Bearer output-secret" });
    configureOpenAi(unsafe);

    const response = await post(requestBody());
    const text = await response.text();

    expect(response.status).toBe(502);
    expect(text).not.toContain("output-secret");
    expect(text).not.toContain("[OCULTO]");
  });

  it("redacts user text and conversation context before provider transport", async () => {
    const fetchSpy = configureOpenAi(JSON.stringify(needsInput));

    const response = await post(requestBody({
      message: "password=private-message-secret",
      context: '{"secret":"private-context-secret"}',
    }));
    const sent = String(fetchSpy.mock.calls[0]?.[1]?.body);

    expect(response.status).toBe(200);
    expect(sent).not.toContain("private-message-secret");
    expect(sent).not.toContain("private-context-secret");
    expect(sent).toContain("[OCULTO]");
  });

  it("does not log request or provider payloads", async () => {
    configureOpenAi(JSON.stringify(needsInput));
    const log = vi.spyOn(console, "log");
    const info = vi.spyOn(console, "info");
    const warn = vi.spyOn(console, "warn");
    const error = vi.spyOn(console, "error");

    await post(requestBody({ message: "password=private-log-secret" }));

    expect(log).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("does not fall back to another provider after a failed request", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "openrouter-server-secret");
    const fetchSpy = vi.fn(async () => new Response("provider-private-error", { status: 429 }));
    vi.stubGlobal("fetch", fetchSpy);

    const response = await post(requestBody({ provider: "openrouter" }));
    const text = await response.text();

    expect(response.status).toBe(502);
    expect(text).not.toMatch(/provider-private-error|openrouter-server-secret/);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
