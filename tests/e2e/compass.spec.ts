import { expect, test } from "@playwright/test";

test("home apresenta quatro jornadas e funciona sem chave", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Clareza para cada/ })).toBeVisible();
  for (const name of ["Quero criar", "Quero entender", "Deu erro", "Quero aprender"]) {
    await expect(page.getByRole("button", { name: new RegExp(`^${name}`) }).last()).toBeVisible();
  }
  await page.getByRole("button", { name: "Abrir assistente" }).click();
  await expect(page.getByText("Modo demonstração", { exact: true })).toBeVisible();
  await page.getByLabel("Sua pergunta").fill("O que é um Trigger?");
  await page.getByRole("button", { name: "Preparar prévia" }).click();
  await expect(page.getByLabel("Prévia do contexto sanitizado")).toBeVisible();
  await page.getByRole("button", { name: "Enviar conteúdo sanitizado" }).click();
  await expect(page.getByTestId("assistant-answer")).toBeVisible();
});

test("carrega exemplo, cria grafo e abre detalhes de action", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Quero entender/ }).last().click();
  await page.getByRole("button", { name: "Carregar exemplo" }).click();
  await expect(page.getByText("Análise concluída", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Visualização" }).click();
  await expect(page.locator(".react-flow")).toBeVisible();
  await page.getByTestId("action-detail-button").first().click();
  await expect(page.getByRole("heading", { name: "Detalhes da etapa" })).toBeVisible();
  await expect(page.getByText("Trecho original", { exact: true })).toBeVisible();
});

test("valida JSON colado e informa JSON inválido", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Quero entender/ }).last().click();
  await page.getByLabel("JSON do workflow", { exact: true }).fill("{ inválido");
  await page.getByRole("button", { name: "Analisar workflow", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(/JSON/i);
  await page.getByLabel("JSON do workflow", { exact: true }).fill(JSON.stringify({ triggers: { Request: { type: "Request", kind: "Http", inputs: { schema: {} } } }, actions: { Compose: { type: "Compose", inputs: "Olá", runAfter: {} } } }));
  await page.getByRole("button", { name: "Analisar workflow", exact: true }).click();
  await expect(page.getByText("Análise concluída", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "JSON original" }).click();
  await expect(page.getByTestId("original-json")).toContainText('"Olá"');
  await page.getByRole("button", { name: "Limpar análise" }).click();
  await expect(page.getByLabel("JSON do workflow", { exact: true })).toHaveValue("");
});

test("permite filtrar findings", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Quero entender/ }).last().click();
  await page.getByLabel("Escolher exemplo").selectOption("problematic");
  await page.getByRole("button", { name: "Carregar exemplo" }).click();
  await page.getByRole("tab", { name: "Pontos de atenção" }).click();
  await expect(page.getByTestId("finding-card").first()).toBeVisible();
  await page.getByLabel("Filtrar categoria").selectOption("security");
  for (const item of await page.getByTestId("finding-card").all()) {
    await expect(item).toContainText("Segurança");
  }
});

test("Doctor diagnostica status 429 sem certeza sobre causa", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Deu erro/ }).last().click();
  await page.getByLabel("Erro ou informações da execução").fill('{"actionName":"Call_API","outputs":{"statusCode":429,"body":{"error":{"code":"TooManyRequests","message":"Request throttled"}},"headers":{"Retry-After":"30"}}}');
  await page.getByRole("button", { name: "Diagnosticar erro" }).click();
  await expect(page.getByTestId("diagnosis-result")).toContainText(/429|throttling/i);
  await expect(page.getByRole("heading", { name: "Causas prováveis" })).toBeVisible();
});

test("não envia contexto automaticamente e sanitiza antes de envio", async ({ page }) => {
  let requests = 0;
  page.on("request", (request) => { if (request.url().endsWith("/api/assistant") && request.method() === "POST") requests += 1; });
  await page.goto("/");
  await page.getByRole("button", { name: "Abrir assistente" }).click();
  await page.getByLabel("Sua pergunta").fill("Authorization: Bearer super-secret-test-value");
  await page.getByRole("button", { name: "Preparar prévia" }).click();
  expect(requests).toBe(0);
  await expect(page.getByLabel("Prévia da pergunta sanitizada")).not.toHaveValue(/super-secret-test-value/);
  await page.getByRole("button", { name: "Enviar conteúdo sanitizado" }).click();
  await expect(page.getByTestId("assistant-answer")).toBeVisible();
  expect(requests).toBe(1);
});

for (const width of [320, 360, 390, 768, 1024, 1440]) {
  test(`navegação e analyzer sem overflow em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    if (width < 1024) {
      await page.getByRole("button", { name: "Abrir menu" }).click();
      await page.getByRole("navigation", { name: "Menu móvel" }).getByRole("button", { name: "Quero entender", exact: true }).click();
    } else {
      await page.getByRole("navigation", { name: "Principal" }).getByRole("button", { name: "Quero entender", exact: true }).click();
    }
    await page.getByRole("button", { name: "Carregar exemplo" }).click();
    for (const name of ["Resumo", "Visualização", "Pontos de atenção", "JSON original"]) {
      await page.getByRole("tab", { name }).click();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow).toBe(false);
    }
  });
}
