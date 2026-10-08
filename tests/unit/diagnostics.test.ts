import { describe, expect, it } from "vitest";
import { diagnoseError, errorExamples } from "@/lib/diagnostics";
import expressionFixture from "../fixtures/errors/expression.json";
import parseJsonFixture from "../fixtures/errors/parse-json.json";

describe("diagnoseError", () => {
  it("diagnostica os fixtures educacionais de expressão e Parse JSON", () => {
    expect(diagnoseError(JSON.stringify(expressionFixture)).classification).toBe("Expressão inválida");
    expect(diagnoseError(JSON.stringify(parseJsonFixture)).classification).toBe("Parse JSON");
  });
  it.each([400, 401, 403, 404, 408, 409, 429, 500, 502, 503])("classifica HTTP %i recursivo", (statusCode) => {
    const diagnosis = diagnoseError(JSON.stringify({ outputs: { body: { innerError: { statusCode, message: "Erro na requisição" } } }, actionName: "Buscar_pedido" }));
    expect(diagnosis.classification).toBe(statusCode >= 500 ? "HTTP 5xx" : `HTTP ${statusCode}`);
    expect(diagnosis.location).toContain("Buscar_pedido");
    expect(diagnosis.evidence).toContainEqual({ path: "$.outputs.body.innerError.statusCode", value: String(statusCode) });
    expect(diagnosis.confidence).toBe("high");
    expect(diagnosis.possibleFixes.length).toBeGreaterThan(0);
  });
  it.each([
    ["HTTP 403 Forbidden", "HTTP 403"],
    ["A operação excedeu o tempo limite", "Timeout"],
    ["Rate limit exceeded: throttling", "Throttling"],
    ["InvalidAuthenticationToken", "Autenticação"],
    ["AuthorizationFailed", "Autorização"],
    ["InvalidTemplate: unable to process template language expressions", "Expressão inválida"],
    ["Parse JSON failed: ValidationFailed schema", "Parse JSON"],
    ["ECONNREFUSED connection refused", "Conexão"],
    ["Trigger did not fire", "Trigger não executado"],
    ["ActionBranchingConditionNotSatisfied action was skipped", "Action ignorada"],
    ["ConnectorOperationFailed", "Falha em connector"],
    ["InvalidWorkflowConfiguration", "Falha em configuração"],
  ])("classifica texto %s", (input, classification) => expect(diagnoseError(input).classification).toBe(classification));
  it("prioriza a causa acionável sobre action ignorada e status bem sucedido", () => {
    const result = diagnoseError('{"statusCode":200,"actions":{"Response":{"status":"Skipped"},"Call":{"outputs":{"statusCode":401}}}}');
    expect(result.classification).toBe("HTTP 401");
    expect(result.location).toContain("Call");
  });
  it("prioriza saída da action que falhou sobre mensagem de entrada de action bem sucedida", () => {
    const result = diagnoseError(JSON.stringify({ actions: { Example: { status: "Succeeded", inputs: { message: "HTTP 401 Unauthorized is an example" } }, FailedCall: { status: "Failed", outputs: { statusCode: 500 } } } }));
    expect(result.classification).toBe("HTTP 5xx");
    expect(result.location).toContain("FailedCall");
    expect(result.confidence).toBe("high");
  });
  it("declara ambiguidade quando há falhas distintas sem causa causal confirmada", () => {
    const result = diagnoseError('{"actions":{"First":{"status":"Failed","outputs":{"statusCode":401}},"Second":{"status":"Failed","outputs":{"statusCode":500}}}}');
    expect(result.confidence).not.toBe("high");
    expect(result.missingInformation.join(" ")).toMatch(/primeira|ordem|causa/i);
  });
  it("prioriza erro específico aninhado sobre envelope genérico", () => {
    expect(diagnoseError('{"statusCode":500,"error":{"code":"InvalidTemplate","message":"Invalid expression"}}').classification).toBe("Expressão inválida");
  });
  it("o nome de uma action não se torna uma causa de falha", () => {
    expect(diagnoseError('{"actionName":"Parse_JSON","statusCode":401,"message":"Credencial expirada"}').classification).toBe("HTTP 401");
  });
  it.each([["BadRequest", "HTTP 400"], ["NotFound", "HTTP 404"], ["Conflict", "HTTP 409"], ["TooManyRequests", "HTTP 429"], ["InternalServerError", "HTTP 5xx"]])("reconhece code %s sem statusCode", (code, classification) => {
    expect(diagnoseError(JSON.stringify({ error: { code } })).classification).toBe(classification);
  });
  it("sanitiza as evidências e reconhece JSON dentro de body", () => {
    const result = diagnoseError(JSON.stringify({ body: '{"statusCode":429,"message":"Authorization: Bearer fake-evidence"}' }));
    expect(result.classification).toBe("HTTP 429");
    expect(JSON.stringify(result)).not.toContain("fake-evidence");
  });
  it("declara dados insuficientes sem inventar certeza", () => {
    const result = diagnoseError("algo deu errado");
    expect(result.classification).toBe("Falha desconhecida");
    expect(result.confidence).toBe("low");
    expect(result.missingInformation.join(" ")).toMatch(/status|action|inputs|outputs/);
  });
  it("fornece exemplos exigidos e referências oficiais", () => {
    expect(errorExamples.length).toBeGreaterThanOrEqual(7);
    expect(diagnoseError(errorExamples[0].input).documentationReferences[0].url).toMatch(/^https:\/\/learn.microsoft.com\//);
  });
});
