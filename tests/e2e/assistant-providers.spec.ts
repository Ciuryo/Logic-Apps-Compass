import { expect, test, type Page } from "@playwright/test";

const providers = [
  { id: "mock", provider: "MockAiProvider", configured: true, mock: true },
  { id: "openrouter", provider: "OpenRouter", configured: false, mock: false },
  { id: "nvidia", provider: "NVIDIA Build", configured: false, mock: false },
  { id: "openai", provider: "OpenAI", configured: false, mock: false },
  { id: "azure", provider: "Azure OpenAI", configured: false, mock: false },
];

async function openAssistant(page: Page, configured?: string) {
  await page.route("**/api/assistant", async (route) => {
    if (route.request().method() !== "GET") { await route.fallback(); return; }
    await route.fulfill({ json: { ...providers[0], providers: providers.map((provider) => ({ ...provider, configured: provider.configured || provider.id === configured })) } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Abrir assistente" }).click();
  await expect(page.getByText("Modo demonstração", { exact: true })).toBeVisible();
}

for (const [provider, keyName, keyUrl] of [
  ["openrouter", "OPENROUTER_API_KEY", "https://openrouter.ai/settings/keys"],
  ["nvidia", "NVIDIA_API_KEY", "https://build.nvidia.com/settings/api-keys"],
] as const) {
  test(`${provider}: explica ativação sem chave e impede envio externo`, async ({ page }) => {
    let posts = 0;
    page.on("request", (request) => { if (request.url().endsWith("/api/assistant") && request.method() === "POST") posts += 1; });
    await openAssistant(page);
    await page.getByLabel("Provedor de IA").selectOption(provider);
    await expect(page.getByText("Provedor não configurado", { exact: true })).toBeVisible();
    await page.getByText("Como ativar este provedor", { exact: true }).click();
    await expect(page.getByRole("link", { name: "Criar chave no provedor" })).toHaveAttribute("href", keyUrl);
    await expect(page.getByTestId("provider-setup")).toContainText(keyName);
    await page.getByLabel("Sua pergunta").fill("Explique runAfter");
    await page.getByRole("button", { name: "Preparar prévia" }).click();
    await expect(page.getByRole("button", { name: "Enviar conteúdo sanitizado" })).toBeDisabled();
    expect(posts).toBe(0);
  });

  test(`${provider}: envia apenas depois da prévia para o destino escolhido`, async ({ page }) => {
    const sent: Record<string, unknown>[] = [];
    await page.route("**/api/assistant", async (route) => {
      if (route.request().method() !== "POST") { await route.fallback(); return; }
      sent.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({ json: { provider: provider === "openrouter" ? "OpenRouter" : "NVIDIA Build", answer: "Orientação de teste controlado.", sources: [], mock: false } });
    });
    await openAssistant(page, provider);
    await page.getByLabel("Provedor de IA").selectOption(provider);
    await page.getByLabel("Modo do assistente").selectOption("Explain");
    await page.getByLabel("Sua pergunta").fill("Authorization: Bearer secret-for-contract-test");
    await page.getByRole("button", { name: "Preparar prévia" }).click();
    expect(sent).toHaveLength(0);
    await expect(page.getByLabel("Prévia da pergunta sanitizada")).not.toHaveValue(/secret-for-contract-test/);
    await page.getByRole("button", { name: "Enviar conteúdo sanitizado" }).click();
    await expect(page.getByTestId("assistant-answer")).toContainText("Orientação de teste controlado.");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ provider, consent: true, mode: "Explain" });
    expect(JSON.stringify(sent[0])).not.toContain("secret-for-contract-test");
  });
}

test("troca de provedor invalida prévia e exige nova revisão", async ({ page }) => {
  await openAssistant(page, "openrouter");
  await page.getByLabel("Sua pergunta").fill("O que é uma action?");
  await page.getByRole("button", { name: "Preparar prévia" }).click();
  await expect(page.getByLabel("Prévia da pergunta sanitizada")).toBeVisible();
  await page.getByLabel("Provedor de IA").selectOption("openrouter");
  await expect(page.getByLabel("Prévia da pergunta sanitizada")).toHaveCount(0);
  await page.getByRole("button", { name: "Preparar prévia" }).click();
  await expect(page.getByTestId("preview-destination")).toContainText("OpenRouter");
  await page.getByLabel("Provedor de IA").selectOption("mock");
  await expect(page.getByRole("button", { name: "Enviar conteúdo sanitizado" })).toHaveCount(0);
});

test("falha de status mantém envio bloqueado", async ({ page }) => {
  await page.route("**/api/assistant", (route) => route.fulfill({ status: 503, json: { error: "Indisponível" } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Abrir assistente" }).click();
  await page.getByLabel("Sua pergunta").fill("Explique triggers");
  await page.getByRole("button", { name: "Preparar prévia" }).click();
  await expect(page.getByRole("button", { name: "Enviar conteúdo sanitizado" })).toBeDisabled();
});

for (const width of [320, 360, 390, 768, 1024, 1440]) {
  test(`ajuda NVIDIA legível sem overflow em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openAssistant(page);
    await page.getByLabel("Provedor de IA").selectOption("nvidia");
    await page.getByText("Como ativar este provedor", { exact: true }).click();
    await expect(page.getByTestId("provider-setup")).toContainText("avaliação");
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    expect(await page.locator(".assistant-body").evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(false);
    if (width === 320 || width === 1440) await page.screenshot({ path: `test-results/assistant-nvidia-${width}.png`, fullPage: true });
  });
}
