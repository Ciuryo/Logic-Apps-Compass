"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { LockKeyhole, Send, ShieldCheck, Sparkles, X } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { redactContent } from "@/lib/security/redaction";
import type { AiProviderId, AiResponse, ProviderCatalog, ProviderStatus } from "@/lib/ai/types";

export type AssistantMode = "Explain" | "Review" | "Build" | "Debug" | "Teach";
export interface AssistantContext { label: string; content: string; mode: AssistantMode; question?: string }
const modes: { id: AssistantMode; label: string }[] = [{ id: "Explain", label: "Explain · Explicar" }, { id: "Review", label: "Review · Revisar" }, { id: "Build", label: "Build · Planejar" }, { id: "Debug", label: "Debug · Diagnosticar" }, { id: "Teach", label: "Teach · Aprender" }];
const providerOptions: { id: AiProviderId; label: string; description: string; keyUrl?: string; setup?: string }[] = [
  { id: "mock", label: "Demonstração local", description: "O MockAiProvider oferece orientação local demonstrativa. Não utiliza um modelo de IA externo." },
  { id: "openrouter", label: "OpenRouter · gratuito", description: "Usa somente modelos gratuitos, sujeitos à disponibilidade e aos limites da conta. Não muda para um modelo pago.", keyUrl: "https://openrouter.ai/settings/keys", setup: "OPENROUTER_API_KEY=sua_chave\nOPENROUTER_MODEL=openrouter/free" },
  { id: "nvidia", label: "NVIDIA Build · avaliação", description: "Acesso gratuito para desenvolvimento e avaliação, sujeito à disponibilidade do modelo e aos limites da conta NVIDIA.", keyUrl: "https://build.nvidia.com/settings/api-keys", setup: "NVIDIA_API_KEY=sua_chave\nNVIDIA_MODEL=nvidia/nemotron-3-ultra-550b-a55b" },
  { id: "openai", label: "OpenAI", description: "Usa a configuração do servidor e as condições de cobrança da sua conta OpenAI." },
  { id: "azure", label: "Azure OpenAI", description: "Usa a configuração do servidor e as condições de cobrança do seu recurso Azure." },
];
function isProviderStatus(value: unknown): value is ProviderStatus {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (item.id === null || providerOptions.some((option) => option.id === item.id)) && typeof item.provider === "string" && typeof item.configured === "boolean" && typeof item.mock === "boolean";
}
function isProviderCatalog(value: unknown): value is ProviderCatalog {
  if (!isProviderStatus(value)) return false;
  const items = (value as unknown as Record<string, unknown>).providers;
  return Array.isArray(items) && items.every(isProviderStatus);
}

export function AssistantPanel({ open, onOpenChange, context }: { open: boolean; onOpenChange: (value: boolean) => void; context: AssistantContext }) {
  const [mode, setMode] = useState(context.mode);
  const [message, setMessage] = useState(context.question ?? "");
  const [includeContext, setIncludeContext] = useState(true);
  const [personalData, setPersonalData] = useState(true);
  const [preview, setPreview] = useState<{ message: string; context: string; count: number; provider: AiProviderId } | null>(null);
  const [catalog, setCatalog] = useState<ProviderCatalog | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<AiProviderId>("mock");
  const [statusError, setStatusError] = useState(false);
  const status = catalog?.providers.find((provider) => provider.id === selectedProvider);
  const selectedOption = providerOptions.find((provider) => provider.id === selectedProvider) ?? providerOptions[0];
  const [answer, setAnswer] = useState<AiResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetch("/api/assistant", { signal: controller.signal, cache: "no-store" }).then(async (response) => {
      const value: unknown = await response.json();
      if (!response.ok || !isProviderCatalog(value)) throw new Error("Status indisponível");
      if (controller.signal.aborted) return;
      setCatalog(value); setSelectedProvider(value.id ?? "mock"); setStatusError(false); setPreview(null);
    }).catch(() => { if (!controller.signal.aborted) { setCatalog(null); setStatusError(true); setPreview(null); } });
    return () => controller.abort();
  }, [open]);
  function preparePreview() {
    setError(""); setAnswer(null);
    if (!message.trim()) { setError("Escreva uma pergunta para preparar a prévia."); return; }
    const question = redactContent(message, { personalData });
    const selected = redactContent(includeContext ? context.content : "", { personalData });
    if (question.content.length > 6000 || selected.content.length > 100000) { setError("O assistente aceita uma pergunta de até 6.000 caracteres e contexto de até 100.000. Reduza a pergunta ou desmarque o contexto; você também pode selecionar uma única action no grafo."); return; }
    setPreview({ message: question.content, context: selected.content, count: question.redactionCount + selected.redactionCount, provider: selectedProvider });
  }
  async function sendMessage() {
    if (!preview || loading || !status?.configured || preview.provider !== selectedProvider) return;
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: preview.provider, mode, message: preview.message, context: preview.context, consent: true }) });
      const result: AiResponse & { error?: string } = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Não foi possível obter uma resposta. Tente novamente.");
      setAnswer(result); setPreview(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "O assistente está indisponível. As ferramentas locais continuam disponíveis."); }
    finally { setLoading(false); }
  }

  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="assistant-dialog">
    <div className="assistant-header"><div><div className="flex-row"><Sparkles size={18} color="#17745b" aria-hidden="true" /><Dialog.Title style={{ fontSize: 17, fontWeight: 650 }}>Assistente Compass</Dialog.Title></div><Dialog.Description className="muted small" style={{ marginTop: 5 }}>Apoio contextual para entender o próximo passo.</Dialog.Description></div><Dialog.Close asChild><Button variant="ghost" className="icon-button" aria-label="Fechar assistente"><X size={20} aria-hidden="true" /></Button></Dialog.Close></div>
    <div className="assistant-body">
      <div className="input-group"><label htmlFor="assistant-provider">Provedor de IA</label><select id="assistant-provider" className="field" value={selectedProvider} disabled={loading || !catalog} onChange={(event) => { setSelectedProvider(event.target.value as AiProviderId); setPreview(null); setAnswer(null); setError(""); }}>{providerOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><p className="small muted">Escolha quem receberá o conteúdo deste envio.</p></div>
      <div className="notice"><div className="flex-row"><ShieldCheck size={15} aria-hidden="true" /><strong>{!catalog ? statusError ? "Verificação indisponível" : "Verificando provedor…" : status?.mock ? "Modo demonstração" : status?.configured ? `Provedor: ${status.provider}` : "Provedor não configurado"}</strong></div><p style={{ marginTop: 7 }}>{selectedOption.description}</p>{!status?.mock && <p style={{ marginTop: 7 }}>Nenhum conteúdo é enviado automaticamente. Revise a prévia antes de autorizar cada envio.</p>}{status && !status.configured && <p style={{ marginTop: 7 }}>Configure este provedor no servidor ou escolha Demonstração local para continuar sem chave.</p>}{statusError && <p style={{ marginTop: 7 }}>Feche e abra o assistente para tentar verificar novamente.</p>}</div>
      {selectedOption.setup && <details className="notice" key={selectedProvider} data-testid="provider-setup"><summary style={{ cursor: "pointer", fontWeight: 650 }}>Como ativar este provedor</summary><div className="stack" style={{ gap: 9, marginTop: 12 }}><a href={selectedOption.keyUrl} target="_blank" rel="noreferrer">Criar chave no provedor</a><p>Guarde a chave em <code>.env.local</code> no servidor, preencha os campos abaixo e reinicie a aplicação:</p><pre style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 11 }}>{selectedOption.setup}</pre><p>{selectedOption.description} A configuração local não comprova a validade da chave ou a cota disponível.</p><p>Não cole a chave na pergunta ou no contexto.</p></div></details>}
      <div className="input-group"><label htmlFor="assistant-mode">Modo do assistente</label><select id="assistant-mode" className="field" value={mode} onChange={(event) => { setMode(event.target.value as AssistantMode); setPreview(null); }}>{modes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>
      <div className="input-group"><label htmlFor="assistant-question">Sua pergunta</label><textarea id="assistant-question" className="textarea" placeholder="Ex.: por que esta action foi ignorada?" value={message} maxLength={6000} onChange={(event) => { setMessage(event.target.value); setPreview(null); }} /></div>
      <div><label className="checkbox-row"><input type="checkbox" checked={includeContext} onChange={(event) => { setIncludeContext(event.target.checked); setPreview(null); }} /><span>Incluir contexto atual: <strong>{context.label}</strong>{!context.content && <span className="muted"> (sem payload carregado)</span>}</span></label><label className="checkbox-row"><input type="checkbox" checked={personalData} onChange={(event) => { setPersonalData(event.target.checked); setPreview(null); }} /><span>Ocultar também CPF, CNPJ, e-mail e telefone</span></label></div>
      <Button variant="secondary" onClick={preparePreview} disabled={loading}><ShieldCheck size={15} aria-hidden="true" /> Preparar prévia</Button>
      {preview && <section className="stack" style={{ gap: 12 }}><div className="flex-row"><h3>Revise antes de enviar</h3><Badge tone="success">{preview.count} ocultações</Badge></div><p className="small" data-testid="preview-destination">Destino: <strong>{selectedOption.label}</strong></p><div className="notice notice-warning">Padrões automáticos podem não identificar todo dado sensível. Confira nomes de recursos e regras de negócio. Ao clicar em enviar, você autoriza somente este conteúdo para o destino indicado.</div><div className="input-group"><label htmlFor="preview-message">Prévia da pergunta sanitizada</label><textarea id="preview-message" className="textarea" value={preview.message} onChange={(event) => setPreview({ ...preview, message: event.target.value })} /></div><div className="input-group"><label htmlFor="preview-context">Prévia do contexto sanitizado</label><textarea id="preview-context" className="textarea json-editor" value={preview.context} placeholder="Sem contexto selecionado." onChange={(event) => setPreview({ ...preview, context: event.target.value })} /></div><Button onClick={sendMessage} disabled={loading || !preview.message.trim() || !status?.configured || preview.provider !== selectedProvider}><Send size={14} aria-hidden="true" />{loading ? "Enviando…" : "Enviar conteúdo sanitizado"}</Button></section>}
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {answer && <section className="panel" data-testid="assistant-answer" aria-live="polite"><div className="flex-row" style={{ marginBottom: 15 }}><h3>Orientação</h3><Badge>{answer.mock ? "Resposta demonstrativa" : answer.provider}</Badge></div><div className="assistant-answer">{answer.answer}</div><div className="source-links">{answer.sources.map((source) => source.url ? <a key={source.title} href={source.url} target="_blank" rel="noreferrer">{source.title}</a> : <span key={source.title}>{source.title} · verificação pendente</span>)}</div></section>}
      <p className="small muted flex-row"><LockKeyhole size={13} aria-hidden="true" /> Análise local não depende deste painel.</p>
    </div>
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
