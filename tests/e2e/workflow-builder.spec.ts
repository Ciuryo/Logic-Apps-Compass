import { expect, test, type Page, type Route } from "@playwright/test";

const providers = [
  { id: "mock", provider: "MockAiProvider", configured: true, mock: true },
  { id: "openrouter", provider: "OpenRouter", configured: false, mock: false },
  { id: "nvidia", provider: "NVIDIA Build", configured: false, mock: false },
  { id: "openai", provider: "OpenAI", configured: false, mock: false },
  { id: "azure", provider: "Azure OpenAI", configured: false, mock: false },
];

const readyResult = {
  status: "ready",
  summary: "Receber um pedido, consultar a API de faturamento e devolver o resultado.",
  assumptions: ["A API aceita pedidos JSON."],
  warnings: ["Confirme o contrato da API antes de importar."],
  plan: {
    name: "Criar_pedido",
    trigger: {
      kind: "Request",
      name: "When_request_received",
      requestSchema: {
        type: "object",
        properties: { orderId: { type: "string" } },
        required: ["orderId"],
        additionalProperties: false,
      },
    },
    actions: [
      {
        kind: "Http",
        name: "Get_invoice",
        method: "POST",
        uri: "https://api.exemplo.test/invoices",
        headers: {},
        body: { kind: "reference", source: "trigger", path: ["orderId"] },
        responseSchema: {
          type: "object",
          properties: { invoiceId: { type: "string" }, total: { type: "number" } },
          required: ["invoiceId", "total"],
          additionalProperties: false,
        },
        authentication: { kind: "bearer", parameterName: "ApiToken" },
      },
      {
        kind: "Response",
        name: "Return_invoice",
        statusCode: 200,
        headers: { "Content-Type": { kind: "literal", value: "application/json" } },
        body: { kind: "reference", source: "action", actionName: "Get_invoice", path: ["invoiceId"] },
      },
    ],
  },
};

const needsInputResult = {
  status: "needs-input",
  summary: "Preciso esclarecer o destino HTTP antes de montar o plano.",
  questions: ["Qual endpoint HTTPS receberá o pedido?"],
  assumptions: [],
  unresolved: ["endpoint"],
};

function providerCatalog(configured: string[] = []) {
  return {
    id: "mock",
    provider: "MockAiProvider",
    configured: true,
    mock: true,
    providers: providers.map((provider) => ({
      ...provider,
      configured: provider.id === "mock" || configured.includes(provider.id),
    })),
  };
}

async function installCatalog(page: Page, configured: string[] = []) {
  await page.route("**/api/assistant", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({ json: providerCatalog(configured) });
  });
}

async function openBuilder(page: Page, configured: string[] = ["openrouter", "nvidia"]) {
  await installCatalog(page, configured);
  await page.goto("/");
  await page.getByRole("button", { name: /^Quero criar/ }).last().click();
  await page.getByRole("button", { name: "Criar workflow Consumption", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Construtor de workflow" })).toBeVisible();
}

test("construtor oferece OpenAI GPT-6 Luna com configuração e preços da API", async ({ page }) => {
  await openBuilder(page);
  const selector = page.getByLabel("Provedor de IA");
  await selector.selectOption("openai");

  await expect(selector.locator('option[value="openai"]')).toHaveText("OpenAI · GPT-6 Luna (padrão, pago)");
  await expect(page.getByText("Como configurar OpenAI · GPT-6 Luna (padrão, pago)")).toBeVisible();
  await expect(page.getByText("OPENAI_MODEL=gpt-6-luna")).toBeVisible();
  await expect(page.getByText(/nível gratuito não está disponível/i)).toBeVisible();
  await expect(page.getByRole("link", { name: "Consultar preços da API" })).toHaveAttribute("href", "https://developers.openai.com/api/docs/pricing");
});

async function preparePreview(page: Page, message: string) {
  await page.getByLabel("Descreva o workflow em linguagem natural").fill(message);
  await page.getByRole("button", { name: "Preparar prévia", exact: true }).click();
  await expect(page.getByLabel("Prévia sanitizada para revisão")).toBeVisible();
}

async function sendWithConsent(page: Page) {
  await page.getByRole("checkbox", { name: "Autorizo o envio da prévia sanitizada e do contexto exibido ao provedor selecionado" }).check();
  await page.getByRole("button", { name: "Enviar prévia revisada", exact: true }).click();
}

test("Quero criar apresenta as duas jornadas e preserva a proposta de arquitetura", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Quero criar/ }).last().click();
  await expect(page.getByRole("button", { name: "Proposta de arquitetura", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Criar workflow Consumption", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Proposta de arquitetura", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Dê forma à sua integração" })).toBeVisible();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Responda:");
});

test("sem provedor configurado ou com Mock, orienta a configuração e mantém a proposta local", async ({ page }) => {
  await openBuilder(page, []);
  await expect(page.getByText("Configure um provedor de IA para montar um workflow personalizado.", { exact: true })).toBeVisible();
  await expect(page.getByText("OPENROUTER_API_KEY", { exact: false })).toBeVisible();
  await preparePreview(page, "Começar quando chegar um pedido.");
  await expect(page.getByRole("button", { name: "Enviar prévia revisada", exact: true })).toBeDisabled();
  await page.getByLabel("Provedor de IA").selectOption("mock");
  await expect(page.getByText("O modo local não gera planos personalizados.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Voltar às opções", exact: true }).click();
  await page.getByRole("button", { name: "Proposta de arquitetura", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Dê forma à sua integração" })).toBeVisible();
});

test("prévia é sanitizada e editável, não envia antes do consentimento e invalida ao editar ou trocar o provedor", async ({ page }) => {
  let postCount = 0;
  await openBuilder(page);
  await page.route("**/api/workflow-builder", async (route) => {
    if (route.request().method() === "POST") {
      postCount += 1;
      await route.fulfill({ json: { result: needsInputResult, provider: "NVIDIA Build" } });
      return;
    }
    await route.fallback();
  });
  await page.getByLabel("Provedor de IA").selectOption("openrouter");
  await preparePreview(page, "Criar pedido. Authorization: Bearer e2e-secret-token");
  await expect(page.getByLabel("Prévia sanitizada para revisão")).not.toHaveValue(/e2e-secret-token/);
  expect(postCount).toBe(0);

  await page.getByLabel("Descreva o workflow em linguagem natural").fill("Criar um fluxo revisado");
  await expect(page.getByLabel("Prévia sanitizada para revisão")).toHaveCount(0);
  await preparePreview(page, "Criar um fluxo revisado");
  await page.getByLabel("Prévia sanitizada para revisão").fill("Criar um fluxo revisado e seguro");
  await expect(page.getByRole("button", { name: "Enviar prévia revisada", exact: true })).toBeDisabled();
  expect(postCount).toBe(0);

  await page.getByLabel("Provedor de IA").selectOption("nvidia");
  await expect(page.getByLabel("Prévia sanitizada para revisão")).toHaveCount(0);
  expect(postCount).toBe(0);
});

test("os controles do construtor têm rótulos acessíveis e recebem foco por teclado", async ({ page }) => {
  await openBuilder(page);
  const backButton = page.getByRole("button", { name: "Voltar às opções", exact: true });
  const providerSelect = page.getByLabel("Provedor de IA");
  await backButton.focus();
  await page.keyboard.press("Tab");
  await expect(providerSelect).toBeFocused();
  await expect(page.getByLabel("Descreva o workflow em linguagem natural")).toBeVisible();
});

test("cada turno needs-input pede nova prévia e consentimento antes de retornar um plano", async ({ page }) => {
  let postCount = 0;
  const submittedBodies: string[] = [];
  await openBuilder(page, ["openrouter"]);
  await page.route("**/api/workflow-builder", async (route) => {
    if (route.request().method() !== "POST") { await route.fallback(); return; }
    postCount += 1;
    submittedBodies.push(route.request().postData() ?? "");
    await route.fulfill({ json: { result: postCount === 1 ? needsInputResult : readyResult, provider: "OpenRouter" } });
  });
  await page.getByLabel("Provedor de IA").selectOption("openrouter");
  await preparePreview(page, "Quando um pedido chegar, faça a integração HTTP.");
  await sendWithConsent(page);
  await expect(page.getByText("Qual endpoint HTTPS receberá o pedido?", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Autorizo o envio da prévia sanitizada e do contexto exibido ao provedor selecionado")).toHaveCount(0);
  expect(postCount).toBe(1);
  expect(submittedBodies[0]).toContain('"consent":true');
  expect(submittedBodies[0]).toContain("Quando um pedido chegar, faça a integração HTTP.");

  await preparePreview(page, "O endpoint é https://api.exemplo.test/invoices e o método é POST.");
  await expect(page.getByLabel("Prévia do contexto anterior que será enviado")).toHaveValue(/Qual endpoint HTTPS receberá o pedido/);
  expect(postCount).toBe(1);
  await sendWithConsent(page);
  await expect(page.getByRole("heading", { name: "Revise o plano proposto" })).toBeVisible();
  expect(postCount).toBe(2);
  expect(submittedBodies[1]).toContain("Qual endpoint HTTPS receberá o pedido");
  expect(submittedBodies[1]).toContain('"consent":true');
});

test("bloqueia resposta incompatível e só gera/baixa artefatos após revisão e confirmação", async ({ page }) => {
  await openBuilder(page, ["openrouter"]);
  await page.getByLabel("Provedor de IA").selectOption("openrouter");
  await page.route("**/api/workflow-builder", async (route: Route) => {
    if (route.request().method() !== "POST") { await route.fallback(); return; }
    await route.fulfill({ json: { result: { status: "ready", plan: { actions: [{ kind: "run arbitrary WDL" }] } }, provider: "OpenRouter" } });
  });
  await preparePreview(page, "Crie uma chamada POST para a API de faturas.");
  await sendWithConsent(page);
  await expect(page.locator(".notice-error[role=alert]")).toContainText("resposta não corresponde ao formato esperado");
  await expect(page.getByRole("checkbox", { name: "Autorizo o envio da prévia sanitizada e do contexto exibido ao provedor selecionado" })).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Enviar prévia revisada", exact: true })).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Revise o plano proposto" })).toHaveCount(0);

  await page.unroute("**/api/workflow-builder");
  await page.route("**/api/workflow-builder", async (route) => {
    if (route.request().method() !== "POST") { await route.fallback(); return; }
    await route.fulfill({ json: { result: readyResult, provider: "OpenRouter" } });
  });
  await preparePreview(page, "Crie uma chamada POST para a API de faturas.");
  await sendWithConsent(page);
  await expect(page.getByRole("heading", { name: "Revise o plano proposto" })).toBeVisible();
  await expect(page.getByText("https://api.exemplo.test/invoices", { exact: true })).toBeVisible();
  await expect(page.getByText("Contrato da resposta", { exact: true })).toBeVisible();
  await expect(page.locator(".workflow-plan-review").getByText("invoiceId", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Gerar pacote para Logic Apps", exact: true })).toBeDisabled();
  await page.getByRole("checkbox", { name: "Revisei triggers, endpoint, método, contrato e autenticação do plano" }).check();
  await page.getByRole("button", { name: "Gerar pacote para Logic Apps", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Prévia do pacote gerado" })).toBeVisible();
  await expect(page.getByText("Validação local concluída", { exact: false })).toBeVisible();
  await expect(page.getByTestId("artifact-preview")).toContainText("Microsoft.Logic/workflows");
  const templateDownload = page.waitForEvent("download");
  await page.getByRole("link", { name: "Baixar azuredeploy.json", exact: true }).click();
  expect((await templateDownload).suggestedFilename()).toBe("azuredeploy.json");
  const readmeDownload = page.waitForEvent("download");
  await page.getByRole("link", { name: "Baixar README.md", exact: true }).click();
  expect((await readmeDownload).suggestedFilename()).toBe("README.md");
});

for (const width of [320, 360, 390, 768, 1024, 1440]) {
  test(`construtor, prévia e plano sem overflow em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await installCatalog(page, ["openrouter"]);
    await page.route("**/api/workflow-builder", async (route) => {
      if (route.request().method() !== "POST") { await route.fallback(); return; }
      await route.fulfill({ json: { result: readyResult, provider: "OpenRouter" } });
    });
    await page.goto("/");
    await page.getByRole("button", { name: /^Quero criar/ }).last().click();
    await page.getByRole("button", { name: "Criar workflow Consumption", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Construtor de workflow" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    await page.getByLabel("Provedor de IA").selectOption("openrouter");
    await preparePreview(page, "Criar workflow com uma chamada HTTP POST.");
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    expect(await page.locator(".skip-link").evaluate((element) => element.matches(":focus"))).toBe(false);
    if (width === 320 || width === 1440) await page.screenshot({ path: `test-results/workflow-builder-consent-${width}.png`, fullPage: true });
    await sendWithConsent(page);
    await expect(page.getByRole("heading", { name: "Revise o plano proposto" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    await page.getByRole("checkbox", { name: "Revisei triggers, endpoint, método, contrato e autenticação do plano" }).check();
    await page.getByRole("button", { name: "Gerar pacote para Logic Apps", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Prévia do pacote gerado" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    expect(await page.getByTestId("artifact-preview").evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(false);
    if (width === 320 || width === 1440) await page.screenshot({ path: `test-results/workflow-builder-artifacts-${width}.png`, fullPage: true });
  });
}
