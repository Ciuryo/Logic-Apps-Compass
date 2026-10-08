import { describe, expect, it } from "vitest";
import { redactContent } from "@/lib/security/redaction";
import secretsFixture from "../fixtures/errors/secrets.json";

describe("redactContent", () => {
  it("não deixa credenciais fictícias do fixture na prévia", () => {
    const result = redactContent(JSON.stringify(secretsFixture), { personalData: true });
    expect(result.content).not.toContain("fake-test-");
    expect(JSON.parse(result.content).uri).toContain("name=public");
  });
  it("oculta credenciais estruturadas sem alterar valores benignos nem a entrada", () => {
    const input = JSON.stringify({ headers: { Authorization: "Bearer fake-token", Cookie: "session=fake-cookie", "Ocp-Apim-Subscription-Key": "fake-subscription", "x-functions-key": "fake-function" }, nested: [{ client_secret: "fake-secret", password: "fake-password", access_token: "fake-access", refresh_token: "fake-refresh", apiKey: "fake-api" }], message: "Processado", statusCode: 401, secretName: "identificador-publico" });
    const result = redactContent(input);
    expect(result.content).not.toMatch(/fake-/);
    expect(JSON.parse(result.content)).toMatchObject({ message: "Processado", statusCode: 401, secretName: "identificador-publico" });
    expect(result.redactionCount).toBe(9);
    expect(input).toContain("fake-secret");
  });
  it.each([
    ["Authorization: Basic dXNlcjpwYXNz", "dXNlcjpwYXNz"],
    ["Cookie: session=fakecookie; auth=fakeauth", "fakecookie"],
    ["https://service.example/path?api_key=fakequery&sig=fakesignature&sv=2024", "fakequery"],
    ["Server=test;Database=test;User Id=test;Password=fakeconnection;", "fakeconnection"],
    ["DefaultEndpointsProtocol=https;AccountName=test;AccountKey=fakeaccount==;EndpointSuffix=core.windows.net", "fakeaccount"],
    ["token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.fake_signature", "eyJhbGci"],
    ['payload: {\\"client_secret\\":\\"fakeescaped\\"}', "fakeescaped"],
    ["x-functions-key: fakeplaintext", "fakeplaintext"],
  ])("oculta segredos no texto %s", (input, secret) => {
    const result = redactContent(input);
    expect(result.content).not.toContain(secret);
    expect(result.redactionCount).toBeGreaterThan(0);
  });
  it("sanitiza JSON serializado dentro de string e credenciais em URL", () => {
    const result = redactContent(JSON.stringify({ body: JSON.stringify({ password: "embeddedsecret" }), url: "https://user:fakeurlpassword@example.com/?sig=fakesig&name=hello" }));
    expect(result.content).not.toMatch(/embeddedsecret|fakeurlpassword|fakesig/);
    expect(result.content).toContain("hello");
  });
  it("mantém PII por padrão e permite ocultar CPF, CNPJ, email e telefone", () => {
    const input = "CPF 123.456.789-00 CNPJ 12.345.678/0001-90 email pessoa@example.com telefone +55 (11) 99999-1234";
    expect(redactContent(input).content).toBe(input);
    const result = redactContent(input, { personalData: true });
    expect(result.content).not.toMatch(/123\.456|12\.345|pessoa@|99999/);
    expect(result.redactionCount).toBe(4);
  });
  it("não duplica a contagem ao sanitizar novamente", () => {
    const once = redactContent('{"secret":"example"}');
    expect(redactContent(once.content).redactionCount).toBe(0);
  });
  it("oculta SAS com nome de parâmetro codificado", () => {
    const result = redactContent("https://example.com/?%73%69%67=fakeencoded&name=hello");
    expect(result.content).not.toContain("fakeencoded"); expect(result.content).toContain("name=hello");
  });
  it("oculta PII em campo numérico sem ocultar status", () => {
    const result = redactContent('{"cpf":12345678900,"cnpj":12345678000190,"statusCode":401}', { personalData: true });
    expect(result.content).not.toMatch(/12345678900|12345678000190/);
    expect(JSON.parse(result.content).statusCode).toBe(401);
  });
  it("oculta parâmetros securestring sem apagar metadados", () => {
    const result = redactContent('{"parameters":{"credential":{"type":"SecureString","defaultValue":"fake-securestring"}}}');
    expect(result.content).not.toContain("fake-securestring"); expect(result.content).toContain("SecureString");
  });
  it("oculta valores citados com aspas diferentes dentro do segredo", () => {
    const result = redactContent(`password="alpha'beta-sensitive"; secret='alpha"gamma-sensitive'`);
    expect(result.content).not.toMatch(/beta-sensitive|gamma-sensitive/);
  });
  it("não preserva sufixo de segredo com aspas escapadas", () => {
    const result = redactContent('password="alpha\\"escaped-sensitive"');
    expect(result.content).not.toContain("escaped-sensitive");
  });
  it("oculta todo o header Cookie com valores citados e múltiplos cookies", () => {
    const result = redactContent('Cookie: session="secretpart"; other=moresecret\nContent-Type: application/json');
    expect(result.content).not.toMatch(/secretpart|moresecret/);
    expect(result.content).toContain("Content-Type: application/json");
  });
  it("oculta Authorization com credencial citada inteira", () => {
    const result = redactContent('Authorization: Bearer "secretpart"\nstatusCode: 401');
    expect(result.content).not.toContain("secretpart");
    expect(result.content).toContain("statusCode: 401");
  });
  it("oculta senha com espaços na connection string", () => {
    const result = redactContent("Server=test;Password=alpha beta;Database=test");
    expect(result.content).not.toMatch(/alpha|beta/);
    expect(result.content).toContain("Database=test");
  });
  it("preserva parâmetros benignos ao ocultar senha de URL", () => {
    const result = redactContent("https://example.com/?password=fake-secret&name=public");
    expect(result.content).not.toContain("fake-secret");
    expect(result.content).toContain("name=public");
  });
  it("conta senha citada de connection string uma única vez e mantém idempotência", () => {
    const once = redactContent('Server=test;Password="alpha beta";Database=test');
    expect(once.redactionCount).toBe(1);
    expect(redactContent(once.content).redactionCount).toBe(0);
  });
});
