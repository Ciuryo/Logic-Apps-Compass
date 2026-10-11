import { expect, test } from "@playwright/test";
import { architectureQuestions } from "../../src/lib/architecture";
import { readFileSync } from "node:fs";

test("wizard valida, recebe respostas e produz proposta completa", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Quero criar/ }).last().click();
  await page.getByRole("button", { name: "Proposta de arquitetura", exact: true }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  for (let stage = 0; stage < 4; stage += 1) {
    for (const question of architectureQuestions.filter((item) => item.stage === stage)) {
      const control = page.locator(`#architecture-${question.key}`);
      if (question.options) await control.selectOption(question.options[0].value);
      else await control.fill(question.key === "event" ? "Novo pedido recebido" : "ERP e API de faturamento");
    }
    await page.getByRole("button", { name: stage === 3 ? "Gerar proposta" : "Continuar", exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: "Proposta de arquitetura" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Checklist de implementação" })).toBeVisible();
  await page.getByRole("button", { name: "Rever respostas" }).click();
  await expect(page.locator("#architecture-ordered")).toBeVisible();
});

test("aula tem exercício, resposta e progresso persistido", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Quero aprender/ }).last().click();
  await page.locator("details.panel").first().locator("summary").first().click();
  await page.getByText("Praticar: exercício", { exact: true }).first().click();
  await page.getByText("Ver resposta comentada", { exact: true }).first().click();
  await page.getByRole("button", { name: "Concluir aula", exact: true }).first().click();
  await expect(page.getByText("1 de 13 concluídas", { exact: false })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /^Quero aprender/ }).last().click();
  await expect(page.getByText("1 de 13 concluídas", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Base de conhecimento", exact: true }).click();
  await page.getByLabel("Buscar por assunto").fill("managed identity");
  await expect(page.getByText("Última verificação: 06/10/2026").first()).toBeVisible();
});

test("template mostra JSON e abre uma análise real", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Principal" }).getByRole("button", { name: "Templates", exact: true }).click();
  await page.getByRole("button", { name: "Explorar template" }).first().click();
  await expect(page.getByRole("heading", { name: "JSON educacional" })).toBeVisible();
  await page.getByRole("button", { name: "Usar no Analyzer" }).first().click();
  await expect(page.getByLabel("JSON do workflow", { exact: true })).toHaveValue(/"actions"/);
  await page.getByRole("button", { name: "Analisar workflow", exact: true }).click();
  await expect(page.getByText("Análise concluída", { exact: true })).toBeVisible();
});

test("upload preserva conteúdo e rejeita arquivo grande", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Quero entender/ }).last().click();
  const fileInput = page.getByLabel("Arquivo JSON do workflow", { exact: true });
  const original = readFileSync(new URL("../../tests/fixtures/workflows/simple.json", import.meta.url), "utf8");
  await fileInput.setInputFiles({ name: "workflow.json", mimeType: "application/json", buffer: Buffer.from(original) });
  await expect(page.getByText("Análise concluída", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "JSON original" }).click();
  await expect(page.getByTestId("original-json")).toHaveText(original);
  await fileInput.setInputFiles({ name: "large.json", mimeType: "application/json", buffer: Buffer.alloc(2 * 1024 * 1024 + 1, " ") });
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Arquivo grande");
});

test("grafo abre e fecha tela cheia por teclado", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Quero entender/ }).last().click();
  await page.getByRole("button", { name: "Carregar exemplo" }).click();
  await page.getByRole("tab", { name: "Visualização" }).click();
  await page.getByRole("button", { name: "Tela cheia", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("detalhes não confundem actions com nomes de mesmo prefixo", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Quero entender/ }).last().click();
  await page.getByLabel("JSON do workflow", { exact: true }).fill(JSON.stringify({
    triggers: { Request: { type: "Request" } },
    actions: { Call: { type: "Compose", inputs: "Valor local" }, Call2: { type: "Http", inputs: { method: "GET", uri: "http://example.com" }, runAfter: { Call: ["Succeeded"] } } }
  }));
  await page.getByRole("button", { name: "Analisar workflow", exact: true }).click();
  await page.getByRole("tab", { name: "Visualização" }).click();
  await page.getByTestId("action-detail-button").filter({ hasText: /^Call$/ }).click();
  const details = page.getByRole("complementary").filter({ has: page.getByRole("heading", { name: "Detalhes da etapa" }) });
  await expect(details).toContainText("Nenhum achado local associado");
  await expect(details).not.toContainText("URL configurada sem HTTPS");
  await page.getByTestId("action-detail-button").filter({ hasText: /^Call2$/ }).click();
  await expect(details).toContainText("URL configurada sem HTTPS");
  await page.screenshot({ path: "test-results/visual-graph-desktop.png", fullPage: true });
});

for (const width of [320, 360, 390, 768, 1024, 1440]) {
  test(`todas as jornadas e assistente sem overflow em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    if (width === 1440) await page.screenshot({ path: "test-results/visual-home-desktop.png", fullPage: true });
    if (width === 320) await page.screenshot({ path: "test-results/visual-home-mobile.png", fullPage: true });
    for (const label of ["Quero criar", "Quero aprender", "Templates", "Deu erro"]) {
      if (width < 1024) await page.getByRole("button", { name: "Abrir menu" }).click();
      await page.getByRole("navigation", { name: width < 1024 ? "Menu móvel" : "Principal" }).getByRole("button", { name: label, exact: true }).click();
      if (label === "Quero aprender") {
        await page.locator("details.panel").first().locator("summary").first().click();
      }
      if (label === "Templates") await page.getByRole("button", { name: "Explorar template" }).first().click();
      if (label === "Deu erro") await page.getByRole("button", { name: "Carregar erro" }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    }
    await page.getByRole("button", { name: "Abrir assistente" }).click();
    await page.getByLabel("Sua pergunta").fill("Explique o diagnóstico.");
    await page.getByRole("button", { name: "Preparar prévia" }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    await page.getByRole("button", { name: "Fechar assistente" }).click();
    if (width === 320) await page.screenshot({ path: "test-results/visual-doctor-mobile.png", fullPage: true });
  });
}
