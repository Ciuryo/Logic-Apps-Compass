import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAiProvider, OpenRouterAiProvider, type AiRequest } from "@/lib/ai";

const workflowBuilderRequest = {
  mode: "Build",
  message: "Crie uma integração simples",
  context: "",
  consent: true,
  instructionProfile: "workflow-builder",
} as unknown as AiRequest;

const providers = [
  {
    name: "Responses API",
    create: () => new OpenAiProvider({ apiKey: "server-secret", model: "test-model" }),
    response: { output: [{ type: "message", content: [{ type: "output_text", text: "{}" }] }] },
    readInstruction: (body: Record<string, unknown>) => String(body.instructions),
  },
  {
    name: "Chat Completions API",
    create: () => new OpenRouterAiProvider({ apiKey: "server-secret", model: "openrouter/free" }),
    response: { choices: [{ finish_reason: "stop", message: { role: "assistant", content: "{}" } }] },
    readInstruction: (body: Record<string, unknown>) => {
      const messages = body.messages as Array<Record<string, unknown>>;
      return String(messages[0]?.content);
    },
  },
];

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("workflow builder provider instruction profile", () => {
  it.each(providers)("uses the fixed JSON-only workflow instructions with the $name", async (provider) => {
    const fetchSpy = vi.fn(async (...args: Parameters<typeof fetch>) => {
      void args;
      return Response.json(provider.response);
    });
    vi.stubGlobal("fetch", fetchSpy);

    await provider.create().sendMessage(workflowBuilderRequest);

    const body = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    const instruction = provider.readInstruction(body);
    expect(instruction).toContain("needs-input");
    expect(instruction).toContain("responseSchema");
    expect(instruction).toContain("Somente JSON");
    expect(instruction).not.toContain("Apresente resposta direta, explicação, passos recomendados");
  });

  it("keeps the regular educational instructions for requests without the workflow profile", async () => {
    const fetchSpy = vi.fn(async (...args: Parameters<typeof fetch>) => {
      void args;
      return Response.json({ output: [{ type: "message", content: [{ type: "output_text", text: "Resposta" }] }] });
    });
    vi.stubGlobal("fetch", fetchSpy);

    await new OpenAiProvider({ apiKey: "server-secret", model: "test-model" }).sendMessage({
      mode: "Explain", message: "Explique", context: "", consent: true,
    });

    const body = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(String(body.instructions)).toContain("Apresente resposta direta, explicação, passos recomendados");
    expect(String(body.instructions)).not.toContain("Somente JSON");
  });
});
