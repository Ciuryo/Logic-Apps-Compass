import { z } from "zod";
import { aiProviderIds, createAiProvider, getProviderStatus } from "@/lib/ai";
import { redactContent } from "@/lib/security/redaction";
import { parseWorkflowBuilderResult } from "@/lib/workflow-builder/schema";
import type { WorkflowBuilderResult } from "@/lib/workflow-builder/types";
import { validateWorkflowPlan } from "@/lib/workflow-builder/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const maximumBodyBytes = 350000;
const requestSchema = z.strictObject({
  message: z.string().min(1).max(6000).refine((value) => value.trim().length > 0),
  context: z.string().max(100000),
  provider: z.enum(aiProviderIds),
  consent: z.literal(true),
});
const responseHeaders = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: responseHeaders });
}

async function readJsonBody(request: Request): Promise<{ payload?: unknown; response?: Response }> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return { response: json({ error: "Envie a descrição e o contexto no formato JSON." }, 415) };
  }
  const advertisedLength = Number(request.headers.get("content-length") ?? "0");
  if (advertisedLength > maximumBodyBytes) {
    return { response: json({ error: "O conteúdo excedeu o limite permitido. Envie uma descrição menor." }, 413) };
  }

  try {
    const reader = request.body?.getReader();
    if (!reader) return { response: json({ error: "Informe a descrição do workflow." }, 400) };
    const decoder = new TextDecoder();
    let bytes = 0;
    let body = "";
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maximumBodyBytes) {
        await reader.cancel();
        return { response: json({ error: "O conteúdo excedeu o limite permitido. Envie uma descrição menor." }, 413) };
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
    return { payload: JSON.parse(body) as unknown };
  } catch {
    return { response: json({ error: "JSON inválido. Revise a descrição antes de enviar." }, 400) };
  }
}

export async function POST(request: Request): Promise<Response> {
  const parsedBody = await readJsonBody(request);
  if (parsedBody.response) return parsedBody.response;

  const validated = requestSchema.safeParse(parsedBody.payload);
  if (!validated.success) {
    const tooLarge = validated.error.issues.some((issue) => issue.code === "too_big");
    return json({ error: tooLarge ? "A descrição ou o contexto excedeu o limite permitido." : "Informe descrição, contexto, provedor e consentimento explícito para este envio." }, tooLarge ? 413 : 400);
  }

  if (validated.data.provider === "mock") {
    return json({ error: "O provedor Mock funciona apenas localmente e não cria planos personalizados. Configure um provedor real para continuar." }, 400);
  }
  const providerStatus = getProviderStatus(validated.data.provider);
  if (!providerStatus.configured) return json({ error: "O provedor selecionado não está configurado no servidor." }, 503);

  const message = redactContent(validated.data.message).content;
  const context = redactContent(validated.data.context).content;
  try {
    const response = await createAiProvider(validated.data.provider).sendMessage({
      mode: "Build",
      message,
      context,
      consent: true,
      provider: validated.data.provider,
      instructionProfile: "workflow-builder",
    });
    if (response.mock || typeof response.answer !== "string") {
      return json({ error: "O provedor selecionado não retornou uma resposta válida para o construtor." }, 502);
    }

    const redactedAnswer = redactContent(response.answer);
    if (redactedAnswer.redactionCount > 0 || response.answer.includes("[OCULTO]") || redactedAnswer.content.includes("[OCULTO]")) {
      return json({ error: "A resposta parece conter credenciais e foi descartada. Revise a descrição sem incluir segredos e tente novamente." }, 502);
    }

    let untrustedResult: unknown;
    try {
      untrustedResult = JSON.parse(response.answer) as unknown;
    } catch {
      return json({ error: "O provedor não retornou o formato estruturado esperado. Revise a descrição e tente novamente." }, 502);
    }

    let result: WorkflowBuilderResult;
    try {
      result = parseWorkflowBuilderResult(untrustedResult);
    } catch {
      return json({ error: "A resposta do provedor não corresponde ao contrato do construtor. Revise os requisitos e tente novamente." }, 502);
    }
    if (result.status === "ready" && !validateWorkflowPlan(result.plan).valid) {
      return json({ error: "O plano retornado não passou pelas validações locais. Esclareça os contratos e tente novamente." }, 502);
    }

    return json({ result, provider: providerStatus.provider });
  } catch {
    return json({ error: "Não foi possível consultar o provedor selecionado. Revise a configuração ou tente novamente; nenhum outro provedor foi usado." }, 502);
  }
}
