import { afterEach, describe, expect, it, vi } from "vitest";
import { createAiProvider, getProviderCatalog, getProviderStatus, NvidiaAiProvider, OpenRouterAiProvider, type AiRequest } from "@/lib/ai";

const request: AiRequest = { mode: "Explain", message: "Explique esta etapa", context: "{}", consent: true };
const answerPayload = (content = "Resposta completa") => ({ choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content, reasoning_content: "raciocínio privado" } }] });
const providers = [
  { id: "openrouter", label: "OpenRouter", key: "OPENROUTER_API_KEY", modelEnv: "OPENROUTER_MODEL", defaultModel: "openrouter/free", url: "https://openrouter.ai/api/v1/chat/completions", create: (timeoutMs?: number) => new OpenRouterAiProvider({ apiKey: "test-secret", timeoutMs }) },
  { id: "nvidia", label: "NVIDIA Build", key: "NVIDIA_API_KEY", modelEnv: "NVIDIA_MODEL", defaultModel: "nvidia/nemotron-3-ultra-550b-a55b", url: "https://integrate.api.nvidia.com/v1/chat/completions", create: (timeoutMs?: number) => new NvidiaAiProvider({ apiKey: "test-secret", timeoutMs }) },
] as const;
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("provedores gratuitos", () => {
  it("resolve padrão, aliases e escolhas explícitas sem alterar o ambiente", async () => {
    vi.stubEnv("AI_PROVIDER", "azure-openai");
    expect(getProviderStatus()).toMatchObject({ id: "azure", provider: "Azure OpenAI" });
    expect(getProviderStatus("mock")).toMatchObject({ id: "mock", configured: true, mock: true });
    vi.stubEnv("AI_PROVIDER", "unknown");
    expect(getProviderCatalog()).toMatchObject({ id: null, configured: false });
    await expect(createAiProvider("mock").sendMessage(request)).resolves.toMatchObject({ mock: true });
  });
  it.each(["openai/gpt-4.1", "provider/model", ":free", "provider/:free", "provider/model:free?paid", "https://evil.test/model:free", "provider/model:free/extra"])("recusa modelo OpenRouter pago ou inválido %s antes do envio", (model) => {
    const fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy);
    vi.stubEnv("OPENROUTER_API_KEY", "secret"); vi.stubEnv("OPENROUTER_MODEL", model);
    expect(getProviderStatus("openrouter")).toMatchObject({ configured: false });
    expect(() => new OpenRouterAiProvider({ apiKey: "secret", model })).toThrow(/gratuito|free/);
    expect(() => createAiProvider("openrouter")).toThrow(/configurado/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("permite modelo explícito gratuito OpenRouter", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "secret"); vi.stubEnv("OPENROUTER_MODEL", "meta-llama/llama-3.3-70b-instruct:free");
    const fetchSpy = vi.fn(async () => Response.json(answerPayload())); vi.stubGlobal("fetch", fetchSpy);
    expect(getProviderStatus("openrouter").configured).toBe(true);
    await createAiProvider("openrouter").sendMessage(request);
    expect(JSON.parse(String((fetchSpy.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toMatchObject({ model: "meta-llama/llama-3.3-70b-instruct:free" });
  });
  for (const provider of providers) {
    describe(provider.label, () => {
      it("exige chave, usa default de modelo e seleciona pelo argumento", async () => {
        vi.stubEnv("AI_PROVIDER", "unknown"); vi.stubEnv(provider.key, ""); vi.stubEnv(provider.modelEnv, "");
        expect(getProviderStatus(provider.id)).toMatchObject({ id: provider.id, configured: false, mock: false });
        vi.stubEnv(provider.key, "test-secret");
        const fetchSpy = vi.fn(async () => Response.json(answerPayload())); vi.stubGlobal("fetch", fetchSpy);
        expect(getProviderStatus(provider.id).configured).toBe(true);
        const result = await createAiProvider(provider.id).sendMessage(request);
        expect(result).toMatchObject({ provider: provider.label, mock: false, answer: "Resposta completa" });
        expect(JSON.parse(String((fetchSpy.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toMatchObject({ model: provider.defaultModel });
      });
      it("envia contrato Chat Completions com instruções curadas e dados sanitizados", async () => {
        const fetchSpy = vi.fn(async () => Response.json(answerPayload())); vi.stubGlobal("fetch", fetchSpy);
        const result = await provider.create().sendMessage({ ...request, message: "password=private-message", context: '{"secret":"private-context"}' });
        const [url, options] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe(provider.url);
        expect(options).toMatchObject({ method: "POST", redirect: "error", cache: "no-store", headers: { "Content-Type": "application/json", Authorization: "Bearer test-secret" } });
        expect(options.body).not.toMatch(/private-message|private-context/);
        const body = JSON.parse(String(options.body)) as { messages: { role: string; content: string }[] };
        expect(body).toMatchObject({ model: provider.defaultModel, stream: false, max_tokens: 1800 });
        expect(body.messages).toHaveLength(2);
        expect(body.messages[0]).toMatchObject({ role: "system", content: expect.stringContaining("português brasileiro") });
        expect(body.messages[0].content).toContain("runAfter liga ações pelo estado de execução");
        expect(body.messages[1]).toMatchObject({ role: "user", content: expect.stringContaining("Pergunta autorizada:") });
        if (provider.id === "nvidia") expect(body).toMatchObject({ chat_template_kwargs: { enable_thinking: false } });
        expect(result.answer).not.toContain("raciocínio privado"); expect(fetchSpy).toHaveBeenCalledTimes(1);
      });
      it("sanitiza resposta e só associa fontes verificadas", async () => {
        const url = "https://learn.microsoft.com/en-us/azure/logic-apps/workflow-definition-language-schema";
        vi.stubGlobal("fetch", vi.fn(async () => Response.json(answerPayload(`password=output-secret\nFonte: ${url}\nOutra: https://learn.microsoft.com/inventada`))));
        const result = await provider.create().sendMessage(request);
        expect(result.answer).not.toMatch(/output-secret|https:\/\/learn.microsoft.com\/inventada/);
        expect(result.answer).toContain(url); expect(result.answer).toContain("pendente");
        expect(result.sources).toEqual([expect.objectContaining({ url, lastVerifiedAt: "2026-10-06" })]);
      });
      it.each([false, undefined, "true"])("recusa consentimento não literal %s sem fetch", async (consent) => {
        const fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy);
        await expect(provider.create().sendMessage({ ...request, consent } as unknown as AiRequest)).rejects.toThrow("autorizar");
        expect(fetchSpy).not.toHaveBeenCalled();
      });
      it("bloqueia execução no navegador", async () => {
        const fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy); vi.stubGlobal("window", {});
        await expect(provider.create().sendMessage(request)).rejects.toThrow("servidor"); expect(fetchSpy).not.toHaveBeenCalled();
      });
      it.each([401, 429])("erro HTTP %s não expõe corpo nem repete envio", async (status) => {
        const fetchSpy = vi.fn(async () => new Response("private-error test-secret", { status })); vi.stubGlobal("fetch", fetchSpy);
        const failure = await provider.create().sendMessage(request).catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(Error); expect(String(failure)).not.toMatch(/private-error|test-secret/); expect(fetchSpy).toHaveBeenCalledTimes(1);
      });
      it("timeout customizado aborta a consulta", async () => {
        let signal: AbortSignal | null | undefined;
        vi.stubGlobal("fetch", vi.fn((_url: string, options: RequestInit) => { signal = options.signal; return new Promise<Response>(() => {}); }));
        await expect(provider.create(10).sendMessage(request)).rejects.toThrow("tempo"); expect(signal?.aborted).toBe(true);
      });
      it("timeout padrão mantém limite de 60 segundos", async () => {
        vi.useFakeTimers(); let signal: AbortSignal | null | undefined;
        vi.stubGlobal("fetch", vi.fn((_url: string, options: RequestInit) => { signal = options.signal; return new Promise<Response>(() => {}); }));
        const pending = expect(provider.create().sendMessage(request)).rejects.toThrow("tempo");
        await vi.advanceTimersByTimeAsync(59999); expect(signal?.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(1); await pending; expect(signal?.aborted).toBe(true);
      });
      it.each([
        null, {}, { error: { message: "private-error" }, ...answerPayload() }, { choices: [] },
        { choices: [{ finish_reason: "length", message: { content: "parcial" } }] },
        { choices: [{ finish_reason: "content_filter", message: { content: "parcial" } }] },
        { choices: [{ finish_reason: "tool_calls", message: { content: "parcial" } }] },
        { choices: [{ message: { content: "sem término" } }] },
        { choices: [{ finish_reason: "stop", message: { content: " " } }] },
        { choices: [{ finish_reason: "stop", message: { content: [{ text: "formato inválido" }] } }] },
        { choices: [{ finish_reason: "stop", message: { reasoning_content: "somente raciocínio" } }] },
        { choices: [{ finish_reason: "stop", message: { content: "texto", tool_calls: [{ id: "call" }] } }] },
      ])("recusa resposta inválida ou parcial %#", async (payload) => {
        vi.stubGlobal("fetch", vi.fn(async () => Response.json(payload)));
        await expect(provider.create().sendMessage(request)).rejects.toThrow("provedor");
      });
    });
  }
});
