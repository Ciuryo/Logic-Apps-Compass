import { afterEach, describe, expect, it, vi } from "vitest";
import { MockAiProvider, OpenAiProvider, AzureOpenAiProvider, createAiProvider, getProviderStatus, type AiRequest } from "@/lib/ai";
import { uniqueReferences, verifiedKnowledgeDocuments } from "@/lib/ai/sources";

const request: AiRequest = { mode: "Explain", message: "Explique esta etapa", context: "{}", consent: true };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("provedores de IA", () => {
  it("exclui conteúdo pendente, não oficial e sem verificação do catálogo de fontes", () => {
    const documents = verifiedKnowledgeDocuments([
      { id: "verified", title: "Verificada", topics: [], summary: "Resumo", officialSource: true, lastVerifiedAt: "2026-10-06", sourceUrl: "https://learn.microsoft.com/verified" },
      { id: "pending", title: "Pendente", topics: [], summary: "Resumo", officialSource: true, lastVerifiedAt: "2026-10-06", sourceUrl: "https://learn.microsoft.com/pending", pending: true },
      { id: "unofficial", title: "Não oficial", topics: [], summary: "Resumo", officialSource: false, lastVerifiedAt: "2026-10-06", sourceUrl: "https://example.com/doc" },
      { id: "undated", title: "Sem data", topics: [], summary: "Resumo", officialSource: true, sourceUrl: "https://learn.microsoft.com/undated" },
    ]);
    expect(documents.map((document) => document.id)).toEqual(["verified"]);
    expect(uniqueReferences([{ title: "Primeira", url: "https://learn.microsoft.com/verified" }, { title: "Duplicada", url: "https://learn.microsoft.com/verified" }, { title: "Pendente", url: "https://learn.microsoft.com/pending", pending: true }])).toEqual([{ title: "Primeira", url: "https://learn.microsoft.com/verified" }]);
  });
  it("mock funciona localmente e identifica resposta simulada", async () => {
    const fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy);
    const result = await new MockAiProvider().sendMessage(request);
    expect(result.mock).toBe(true); expect(result.answer).toMatch(/simulad|local/i); expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("usa GPT-6 Luna quando só a chave OpenAI está configurada", async () => {
    vi.stubEnv("AI_PROVIDER", "openai"); vi.stubEnv("OPENAI_API_KEY", "fake-server-secret"); vi.stubEnv("OPENAI_MODEL", "");
    const fetchSpy = vi.fn(async () => Response.json({ output: [{ type: "message", content: [{ type: "output_text", text: "Resposta Luna" }] }] }));
    vi.stubGlobal("fetch", fetchSpy);

    expect(getProviderStatus()).toMatchObject({ id: "openai", provider: "OpenAI", configured: true, mock: false });
    await createAiProvider().sendMessage(request);

    const [, options] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(options.body))).toMatchObject({ model: "gpt-6-luna", store: false });
  });
  it("OpenAI envia Responses sem storage e sanitiza mensagem e contexto", async () => {
    const fetchSpy = vi.fn(async () => Response.json({ output: [{ type: "message", content: [{ type: "output_text", text: "Resposta verificada" }] }] }));
    vi.stubGlobal("fetch", fetchSpy);
    const result = await new OpenAiProvider({ apiKey: "server-secret", model: "configured-model" }).sendMessage({ ...request, message: "password=message-secret", context: '{"secret":"context-secret"}' });
    const [url, options] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(options.body).not.toMatch(/message-secret|context-secret/);
    expect(JSON.parse(String(options.body))).toMatchObject({ store: false, model: "configured-model" });
    expect(result.answer).toBe("Resposta verificada"); expect(result.mock).toBe(false);
  });
  it("Azure usa endpoint v1 e deployment configurado", async () => {
    const fetchSpy = vi.fn(async () => Response.json({ output: [{ type: "message", content: [{ type: "output_text", text: "Resposta Azure" }] }] })); vi.stubGlobal("fetch", fetchSpy);
    await new AzureOpenAiProvider({ apiKey: "server-secret", endpoint: "https://resource.openai.azure.com/", deployment: "configured-deployment" }).sendMessage(request);
    const [url, options] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://resource.openai.azure.com/openai/v1/responses");
    expect(JSON.parse(String(options.body)).model).toBe("configured-deployment");
  });
  it("não expõe body de erro do provedor", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("private-payload-secret", { status: 401 })));
    await expect(new OpenAiProvider({ apiKey: "server-secret", model: "configured-model" }).sendMessage(request)).rejects.toThrow("provedor");
    await expect(new OpenAiProvider({ apiKey: "server-secret", model: "configured-model" }).sendMessage(request)).rejects.not.toThrow("private-payload-secret");
  });
  it("limita tempo de espera e cancela requisição externa", async () => {
    let signal: AbortSignal | null | undefined;
    vi.stubGlobal("fetch", vi.fn((_url: string, options: RequestInit) => { signal = options.signal; return new Promise<Response>(() => {}); }));
    await expect(new OpenAiProvider({ apiKey: "test", model: "configured-model", timeoutMs: 10 }).sendMessage(request)).rejects.toThrow("tempo");
    expect(signal?.aborted).toBe(true);
  });
  it("marca links inventados como pendentes e não os retorna como fontes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ output: [{ type: "message", content: [{ type: "output_text", text: "Veja https://learn.microsoft.com/fake-connectors/private" }] }] })));
    const result = await new OpenAiProvider({ apiKey: "test", model: "configured-model" }).sendMessage(request);
    expect(result.answer).not.toContain("https://learn.microsoft.com/fake");
    expect(result.answer).toContain("pendente"); expect(result.sources).toEqual([]);
  });
  it("preserva referência WDL verificada e inclui conteúdo local nas instruções", async () => {
    const url = "https://learn.microsoft.com/en-us/azure/logic-apps/workflow-definition-language-schema";
    const fetchSpy = vi.fn(async () => Response.json({ output: [{ type: "message", content: [{ type: "output_text", text: `A definição segue WDL. Fonte: ${url}` }] }] }));
    vi.stubGlobal("fetch", fetchSpy);
    const result = await new OpenAiProvider({ apiKey: "test", model: "configured-model" }).sendMessage(request);
    const [, options] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    const sent = JSON.parse(String(options.body)) as { instructions: string };
    expect(sent.instructions).toContain("runAfter liga ações pelo estado de execução");
    expect(result.answer).toContain(url);
    expect(result.sources).toEqual([expect.objectContaining({ url, lastVerifiedAt: "2026-10-06" })]);
  });
  it("Teach local cita conteúdo de triggers e actions em vez de somente diagnóstico", async () => {
    const result = await new MockAiProvider().sendMessage({ ...request, mode: "Teach" });
    const url = "https://learn.microsoft.com/en-us/azure/logic-apps/logic-apps-workflow-actions-triggers";
    expect(result.sources.some((source) => source.url === url)).toBe(true);
    expect(result.sources.every((source) => source.url !== "https://learn.microsoft.com/en-us/azure/logic-apps/logic-apps-diagnosing-failures")).toBe(true);
    expect(result.answer).toContain(url);
    expect(new Set(result.sources.map((source) => source.url)).size).toBe(result.sources.length);
  });
  it("provedor recusa consentimento ausente mesmo fora da rota", async () => {
    const fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy);
    const unauthorized = { ...request, consent: false } as unknown as AiRequest;
    await expect(new OpenAiProvider({ apiKey: "test", model: "configured-model" }).sendMessage(unauthorized)).rejects.toThrow("autorizar");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("Azure rejeita endpoint inseguro ou com credenciais", () => {
    expect(() => new AzureOpenAiProvider({ apiKey: "test", deployment: "configured", endpoint: "http://resource.openai.azure.com" })).toThrow("HTTPS");
    expect(() => new AzureOpenAiProvider({ apiKey: "test", deployment: "configured", endpoint: "https://user:password@resource.openai.azure.com" })).toThrow("HTTPS");
  });
});
