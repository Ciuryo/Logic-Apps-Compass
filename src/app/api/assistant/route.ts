import { z } from "zod";
import { aiModes, aiProviderIds, createAiProvider, getProviderCatalog, getProviderStatus } from "@/lib/ai";
import { redactContent } from "@/lib/security/redaction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const maximumBodyBytes = 350000;
const requestSchema = z.object({ mode: z.enum(aiModes), message: z.string().trim().min(1).max(6000), context: z.string().max(100000), consent: z.literal(true), provider: z.enum(aiProviderIds).optional() }).strict();
const responseHeaders = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: responseHeaders });

export async function GET(): Promise<Response> { return json(getProviderCatalog()); }

export async function POST(request: Request): Promise<Response> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "Envie o contexto no formato JSON." }, 415);
  const advertisedLength = Number(request.headers.get("content-length") ?? "0");
  if (advertisedLength > maximumBodyBytes) return json({ error: "O conteúdo excedeu o limite permitido. Selecione um trecho menor." }, 413);
  let payload: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "Informe o contexto autorizado." }, 400);
    const decoder = new TextDecoder();
    let bytes = 0;
    let body = "";
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maximumBodyBytes) { await reader.cancel(); return json({ error: "O conteúdo excedeu o limite permitido. Selecione um trecho menor." }, 413); }
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
    payload = JSON.parse(body) as unknown;
  } catch { return json({ error: "JSON inválido. Revise o conteúdo antes de enviar." }, 400); }
  const validated = requestSchema.safeParse(payload);
  if (!validated.success) {
    const tooLarge = validated.error.issues.some((issue) => issue.code === "too_big");
    return json({ error: tooLarge ? "O conteúdo excedeu o limite permitido. Use até 6.000 caracteres na pergunta e 100.000 no contexto." : "Informe modo, pergunta, contexto e autorização explícita para este envio." }, tooLarge ? 413 : 400);
  }
  if (!getProviderStatus(validated.data.provider).configured) return json({ error: "O provedor selecionado não está configurado. Revise as variáveis do servidor ou use o modo local." }, 503);
  try {
    const result = await createAiProvider(validated.data.provider).sendMessage({ ...validated.data, message: redactContent(validated.data.message).content, context: redactContent(validated.data.context).content });
    return json(result);
  } catch { return json({ error: "Não foi possível obter a resposta do provedor. Revise a configuração ou tente novamente; o diagnóstico local continua disponível." }, 502); }
}
