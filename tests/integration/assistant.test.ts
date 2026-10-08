import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/assistant/route";

const post = (body: unknown) => POST(new Request("http://localhost/api/assistant", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("assistant API", () => {
  it("GET publica catálogo dos cinco provedores sem segredos ou endpoint privado", async () => {
    vi.stubEnv("AI_PROVIDER", "openrouter"); vi.stubEnv("OPENROUTER_API_KEY", "openrouter-private-key");
    vi.stubEnv("AZURE_OPENAI_API_KEY", "azure-private-key"); vi.stubEnv("AZURE_OPENAI_ENDPOINT", "https://private-resource.openai.azure.com");
    const fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy);
    const response = await GET();
    const text = await response.text();
    expect(JSON.parse(text)).toMatchObject({ id: "openrouter", configured: true, providers: [
      { id: "mock", configured: true, mock: true }, { id: "openrouter", configured: true, mock: false },
      { id: "nvidia", provider: "NVIDIA Build", mock: false }, { id: "openai", mock: false }, { id: "azure", mock: false },
    ] });
    expect(text).not.toMatch(/private-key|private-resource/); expect(fetchSpy).not.toHaveBeenCalled();
  });
  it.each([
    ["openrouter", "OPENROUTER_API_KEY", "OpenRouter", "https://openrouter.ai/api/v1/chat/completions"],
    ["nvidia", "NVIDIA_API_KEY", "NVIDIA Build", "https://integrate.api.nvidia.com/v1/chat/completions"],
  ])("POST escolhe %s independente do padrão AI_PROVIDER", async (provider, key, label, endpoint) => {
    vi.stubEnv("AI_PROVIDER", "azure"); vi.stubEnv(key, "fake-server-key");
    const fetchSpy = vi.fn(async () => Response.json({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: "Resposta completa" } }] }));
    vi.stubGlobal("fetch", fetchSpy);
    const response = await post({ mode: "Explain", message: "password=private-input", context: '{"secret":"private-context"}', consent: true, provider });
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ provider: label, mock: false, answer: "Resposta completa" });
    const [url, options] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(endpoint); expect(options.body).not.toMatch(/private-input|private-context/);
  });
  it("provedor desconhecido retorna 400 sem chamada externa", async () => {
    const fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy);
    expect((await post({ mode: "Explain", message: "Oi", context: "{}", consent: true, provider: "paid-unknown" })).status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("OpenRouter pago é configuração inválida e não envia", async () => {
    vi.stubEnv("AI_PROVIDER", "mock"); vi.stubEnv("OPENROUTER_API_KEY", "test"); vi.stubEnv("OPENROUTER_MODEL", "openai/gpt-4.1");
    const fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy);
    expect((await post({ mode: "Explain", message: "Oi", context: "{}", consent: true, provider: "openrouter" })).status).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it.each(["openrouter", "nvidia"])("falha de %s não usa outro provedor nem ecoa erro", async (provider) => {
    vi.stubEnv("AI_PROVIDER", "mock"); vi.stubEnv("OPENROUTER_API_KEY", "server-secret"); vi.stubEnv("NVIDIA_API_KEY", "server-secret");
    const fetchSpy = vi.fn(async () => new Response("private-body", { status: 429 })); vi.stubGlobal("fetch", fetchSpy);
    const response = await post({ mode: "Explain", message: "password=private-input", context: "{}", consent: true, provider });
    expect(response.status).toBe(502); expect(await response.text()).not.toMatch(/private-body|private-input|server-secret/);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
  it("GET identifica mock sem chamada externa", async () => {
    vi.stubEnv("AI_PROVIDER", "mock"); const fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy);
    expect(await (await GET()).json()).toMatchObject({ configured: true, mock: true }); expect(fetchSpy).not.toHaveBeenCalled();
  });
  it.each([undefined, false, "true"])("bloqueia envio sem consentimento booleano explícito %s", async (consent) => {
    const fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy);
    expect((await post({ mode: "Explain", message: "Oi", context: "{}", consent })).status).toBe(400); expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("valida modo, mensagem e tamanho antes de enviar", async () => {
    expect((await post({ mode: "Other", message: "Oi", context: "{}", consent: true })).status).toBe(400);
    expect((await post({ mode: "Explain", message: " ", context: "{}", consent: true })).status).toBe(400);
    expect((await post({ mode: "Explain", message: "Oi", context: "x".repeat(100001), consent: true })).status).toBe(413);
  });
  it("funciona sem chave e retorna contrato do mock", async () => {
    vi.stubEnv("AI_PROVIDER", "mock");
    const response = await post({ mode: "Debug", message: "Ajude", context: "HTTP 401", consent: true });
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ mock: true, provider: "MockAiProvider", sources: expect.any(Array), answer: expect.any(String) });
  });
  it("falha de provedor usa mensagem segura sem ecoar entrada", async () => {
    vi.stubEnv("AI_PROVIDER", "openai"); vi.stubEnv("OPENAI_API_KEY", "fake-key"); vi.stubEnv("OPENAI_MODEL", "configured-model");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("sensitive-provider-content", { status: 500 })));
    const response = await post({ mode: "Explain", message: "password=input-secret", context: "{}", consent: true });
    expect(response.status).toBe(502); expect(await response.text()).not.toMatch(/sensitive-provider-content|input-secret|fake-key/);
  });
  it("limita body mesmo sem content-length e não consulta provedor", async () => {
    const fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy);
    const response = await POST(new Request("http://localhost/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: "x".repeat(350001) }));
    expect(response.status).toBe(413); expect(fetchSpy).not.toHaveBeenCalled();
  });
});
