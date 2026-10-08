"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ShieldCheck, Stethoscope, Trash2 } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { diagnoseError, errorExamples, type Diagnosis } from "@/lib/diagnostics";
import type { AssistantContext } from "@/features/assistant";

export function Diagnostics({ onContext, onAskAssistant }: { onContext: (context: AssistantContext) => void; onAskAssistant: (context: AssistantContext) => void }) {
  const [input, setInput] = useState("");
  const [example, setExample] = useState(errorExamples[0]?.id ?? "400");
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const diagnosisVersion = useRef(0);
  async function diagnose(value = input) {
    if (!value.trim()) { setError("Cole uma mensagem de erro, body ou informações do Run History."); return; }
    if (value.length > 2 * 1024 * 1024) { setError("Conteúdo grande: limite de 2 MB para diagnóstico local."); return; }
    const version = ++diagnosisVersion.current;
    setLoading(true); setError(""); setDiagnosis(null); onContext({ label: "Doctor · diagnóstico em andamento", content: "", mode: "Debug" });
    await new Promise<void>((resolve) => window.setTimeout(resolve, 20));
    if (version !== diagnosisVersion.current) return;
    try { const result = diagnoseError(value); setDiagnosis(result); onContext({ label: "Erro da execução", content: value, mode: "Debug" }); }
    catch { setError("Não foi possível analisar este conteúdo. Tente uma mensagem menor com status e nome da action."); }
    finally { if (version === diagnosisVersion.current) setLoading(false); }
  }
  function loadExample() { const selected = errorExamples.find((item) => item.id === example); if (selected) { setInput(selected.input); void diagnose(selected.input); } }
  return <div className="stack"><div className="page-heading" style={{ marginBottom: 0 }}><div><h1>Encontre o próximo passo.</h1><p>Um diagnóstico orientado pelas evidências da execução, com hipóteses e caminhos de investigação.</p></div><Badge tone="success"><ShieldCheck size={12} aria-hidden="true" /> Diagnóstico local</Badge></div>
    <div className="doctor-layout"><section className="panel stack"><div><h2 style={{ fontSize: 17 }}>O que aconteceu?</h2><p className="small muted" style={{ marginTop: 8 }}>Cole um erro JSON, body retornado, informações do Run History ou uma mensagem em texto.</p></div><div className="input-group"><label htmlFor="doctor-input">Erro ou informações da execução</label><textarea id="doctor-input" className="textarea json-editor" style={{ minHeight: 270 }} value={input} onChange={(event) => setInput(event.target.value)} placeholder={'{\n  "statusCode": 429,\n  "message": "Too many requests"\n}'} spellCheck={false} /></div><div className="example-control"><div className="input-group"><label htmlFor="doctor-example">Exemplo de erro</label><select id="doctor-example" className="field" value={example} onChange={(event) => setExample(event.target.value)}>{errorExamples.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></div><Button variant="secondary" onClick={loadExample} disabled={loading}>Carregar erro</Button></div><div className="form-actions" style={{ marginTop: 0 }}><Button onClick={() => void diagnose()} disabled={loading}><Stethoscope size={15} aria-hidden="true" />{loading ? "Investigando…" : "Diagnosticar erro"}</Button><Button variant="ghost" onClick={() => { diagnosisVersion.current += 1; setInput(""); setDiagnosis(null); setError(""); setLoading(false); onContext({ label: "Doctor · sem erro", content: "", mode: "Debug" }); }} aria-label="Limpar diagnóstico"><Trash2 size={15} aria-hidden="true" /></Button></div>{error && <div className="notice notice-error" role="alert">{error}</div>}<p className="small muted">O diagnóstico não acessa o Azure. Evidências exibidas são sanitizadas; os dados originais permanecem no editor.</p></section>
      {!diagnosis ? <section className="panel empty-state"><span className="journey-icon"><Stethoscope size={25} aria-hidden="true" /></span><h2 style={{ fontSize: 17 }}>{loading ? "Investigando as evidências…" : "Erros ficam mais claros com contexto"}</h2><p>HTTP 401, throttling, expressão inválida ou Parse JSON: comece por uma mensagem. Quando faltar informação, vamos indicar o que procurar.</p></section> : <section className="panel doctor-result" data-testid="diagnosis-result" aria-live="polite"><div><div className="flex-row" style={{ marginBottom: 12 }}><CheckCircle2 size={16} color="#17745b" aria-hidden="true" /><Badge>{diagnosis.classification}</Badge><Badge tone={diagnosis.confidence === "high" ? "success" : "warning"}>Confiança {diagnosis.confidence === "high" ? "alta" : diagnosis.confidence === "medium" ? "média" : "baixa"}</Badge></div><h2 style={{ fontSize: 20 }}>{diagnosis.summary}</h2><p className="small muted" style={{ marginTop: 10 }}><strong>Onde provavelmente ocorreu: </strong>{diagnosis.location}</p></div><div className="notice notice-warning flex-row"><AlertTriangle size={15} aria-hidden="true" />Causas prováveis são hipóteses. Confirme nos inputs e outputs da execução.</div><section><h3>Evidências encontradas</h3>{diagnosis.evidence.length ? diagnosis.evidence.map((evidence, index) => <div className="doctor-evidence" key={index}><code>{evidence.path}</code><span>{evidence.value}</span></div>) : <p className="small muted">Sem evidências estruturadas suficientes.</p>}</section>
        {[{ title: "Causas prováveis", values: diagnosis.probableCauses }, { title: "Checklist de investigação", values: diagnosis.investigationChecklist }, { title: "Possíveis correções", values: diagnosis.possibleFixes }].map((section) => <section key={section.title}><h3>{section.title}</h3><ul>{section.values.map((value) => <li key={value}>{value}</li>)}</ul></section>)}
        {diagnosis.missingInformation.length > 0 && <section><h3>O que ajudaria a confirmar</h3><ul>{diagnosis.missingInformation.map((value) => <li key={value}>{value}</li>)}</ul></section>}<section><h3>Referências oficiais</h3><div className="source-links">{diagnosis.documentationReferences.map((source) => source.url ? <a key={source.title} href={source.url} target="_blank" rel="noreferrer">{source.title}</a> : <span key={source.title}>{source.title} · referência pendente</span>)}</div></section><Button variant="secondary" onClick={() => onAskAssistant({ label: "Erro diagnosticado", content: input, mode: "Debug", question: "Ajude-me a investigar este erro e separe os fatos das hipóteses." })}>Investigar com assistente</Button>
      </section>}
    </div></div>;
}
