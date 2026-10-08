"use client";

import { useRef, useState, type DragEvent } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { Braces, CheckCircle2, FileJson, GitBranch, LoaderCircle, ShieldCheck, Trash2, Upload } from "lucide-react";
import { Badge, Button, CodeBlock } from "@/components/ui";
import { parseWorkflow } from "@/lib/logic-apps/parser";
import { analyzeWorkflow } from "@/lib/logic-apps/rules";
import { workflowExamples } from "@/content/examples";
import { WorkflowVisualizer } from "@/features/workflow-visualizer";
import type { AssistantContext } from "@/features/assistant";
import type { Finding, ParsedWorkflow } from "@/types/workflow";
import { Findings } from "./findings";
import { WorkflowSummary } from "./summary";

interface AnalyzerProps { initialInput?: string; onContext: (context: AssistantContext) => void; onAskAssistant: (context: AssistantContext) => void }

export function WorkflowAnalyzer({ initialInput, onContext, onAskAssistant }: AnalyzerProps) {
  const [input, setInput] = useState(initialInput ?? "");
  const [exampleId, setExampleId] = useState(workflowExamples[0]?.id ?? "simple");
  const [workflow, setWorkflow] = useState<ParsedWorkflow | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [tab, setTab] = useState("summary");
  const [fileName, setFileName] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const analysisVersion = useRef(0);
  async function analyze(value = input) {
    const version = ++analysisVersion.current;
    setError(""); setLoading(true); setWorkflow(null); setFindings([]);
    onContext({ label: "Quero entender · análise em andamento", content: "", mode: "Review" });
    await new Promise<void>((resolve) => window.setTimeout(resolve, 20));
    if (version !== analysisVersion.current) return;
    try {
      const parsed = parseWorkflow(value);
      const attention = analyzeWorkflow(parsed);
      setWorkflow(parsed); setFindings(attention); setTab("summary");
      onContext({ label: parsed.name, content: parsed.sourceText, mode: "Review" });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível validar o JSON. Confira a estrutura do workflow."); }
    finally { if (version === analysisVersion.current) setLoading(false); }
  }
  async function readFile(file?: File) {
    if (!file) return;
    setError("");
    if (!file.name.toLowerCase().endsWith(".json")) { setError("Selecione um arquivo com extensão .json."); return; }
    if (file.size > 2 * 1024 * 1024) { setError("Arquivo grande: o limite desta versão é 2 MB. Use uma definição menor ou remova dados de execução desnecessários em uma cópia."); return; }
    try { const content = await file.text(); setInput(content); setFileName(file.name); await analyze(content); }
    catch { setError("Não foi possível ler o arquivo. Selecione-o novamente."); }
  }
  function loadExample() { const example = workflowExamples.find((item) => item.id === exampleId); if (example) { setInput(example.json); setFileName(""); void analyze(example.json); } }
  function clearAnalysis() { analysisVersion.current += 1; setInput(""); setWorkflow(null); setFindings([]); setError(""); setFileName(""); setLoading(false); if (fileInput.current) fileInput.current.value = ""; onContext({ label: "Quero entender · sem workflow", content: "", mode: "Explain" }); }
  function dropFile(event: DragEvent<HTMLDivElement>) { event.preventDefault(); setDragging(false); void readFile(event.dataTransfer.files[0]); }

  return <div className="stack">
    <div className="page-heading" style={{ marginBottom: 0 }}><div><h1>Entenda o seu workflow.</h1><p>Transforme o JSON em um mapa de etapas e encontre pontos que merecem uma revisão.</p></div><Badge tone="success"><ShieldCheck size={12} aria-hidden="true" /> Processamento local</Badge></div>
    <section className="panel"><div className="analyzer-input"><div className="stack" style={{ gap: 15 }}>
      <div className={`drop-zone ${dragging ? "dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={dropFile}><Upload size={23} color="#17745b" aria-hidden="true" /><strong style={{ fontSize: 13 }}>Arraste seu arquivo JSON</strong><p>Até 2 MB. O original é preservado.</p><Button variant="secondary" onClick={() => fileInput.current?.click()}>Selecionar arquivo</Button><input ref={fileInput} type="file" accept=".json,application/json" className="sr-only" tabIndex={-1} aria-label="Arquivo JSON do workflow" onChange={(event) => void readFile(event.target.files?.[0])} />{fileName && <Badge>{fileName}</Badge>}</div>
      <div className="input-group"><label htmlFor="workflow-example">Escolher exemplo</label><select id="workflow-example" className="field" value={exampleId} onChange={(event) => setExampleId(event.target.value)}>{workflowExamples.map((example) => <option key={example.id} value={example.id}>{example.title}</option>)}</select><Button variant="secondary" onClick={loadExample} disabled={loading}><FileJson size={15} aria-hidden="true" /> Carregar exemplo</Button></div>
    </div><div className="input-group"><label htmlFor="workflow-json">JSON do workflow</label><textarea id="workflow-json" className="textarea json-editor" placeholder={'{\n  "triggers": { ... },\n  "actions": { ... }\n}'} value={input} spellCheck={false} onChange={(event) => setInput(event.target.value)} /><p className="small muted">Cole uma definição, um workflow Standard ou um recurso ARM contendo a definição.</p></div></div>
      <div className="form-actions"><Button onClick={() => void analyze()} disabled={loading}>{loading ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : <GitBranch size={15} aria-hidden="true" />}{loading ? "Analisando…" : "Analisar workflow"}</Button><Button variant="ghost" onClick={clearAnalysis}><Trash2 size={14} aria-hidden="true" /> Limpar análise</Button><span className="small muted" style={{ marginLeft: "auto" }}>Nenhum dado é enviado para IA.</span></div>
      {error && <div className="notice notice-error" role="alert" style={{ marginTop: 16 }}>{error}</div>}
    </section>
    {!workflow && !loading && !error && <section className="panel empty-state"><span className="journey-icon"><Braces size={25} aria-hidden="true" /></span><h2 style={{ fontSize: 17 }}>Um workflow, vários caminhos para entender</h2><p>Carregue um exemplo para explorar o grafo, as dependências e a revisão local. Você não precisa conectar uma subscription.</p></section>}
    {loading && <div className="notice" role="status">Lendo a definição e aplicando regras locais…</div>}
    {workflow && <section><div className="section-heading"><div className="flex-row"><CheckCircle2 size={16} color="#17745b" aria-hidden="true" /><strong className="small" role="status">{workflow.partial ? "Análise parcial" : "Análise concluída"}</strong><Badge>{findings.length} pontos de atenção</Badge></div><Button variant="ghost" onClick={() => onAskAssistant({ label: workflow.name, content: workflow.sourceText, mode: "Review", question: "Ajude-me a revisar os pontos de atenção deste workflow." })}>Revisar com assistente</Button></div>{workflow.warnings.map((warning, index) => <div className="notice notice-warning" key={index} style={{ marginBottom: 12 }}>{warning}</div>)}
      <Tabs.Root value={tab} onValueChange={setTab}><Tabs.List className="tabs-list" aria-label="Resultados da análise"><Tabs.Trigger value="summary" className="tab-trigger">Resumo</Tabs.Trigger><Tabs.Trigger value="graph" className="tab-trigger">Visualização</Tabs.Trigger><Tabs.Trigger value="findings" className="tab-trigger">Pontos de atenção</Tabs.Trigger><Tabs.Trigger value="original" className="tab-trigger">JSON original</Tabs.Trigger></Tabs.List><Tabs.Content value="summary" className="tab-content"><WorkflowSummary workflow={workflow} /></Tabs.Content><Tabs.Content value="graph" className="tab-content"><WorkflowVisualizer workflow={workflow} findings={findings} onAskAssistant={onAskAssistant} /></Tabs.Content><Tabs.Content value="findings" className="tab-content"><Findings findings={findings} /></Tabs.Content><Tabs.Content value="original" className="tab-content"><div className="notice notice-warning" style={{ marginBottom: 14 }}>Este é o conteúdo original, sem sanitização. Ele só será enviado ao assistente após prévia e autorização explícita.</div><CodeBlock testId="original-json">{workflow.sourceText}</CodeBlock></Tabs.Content></Tabs.Root>
    </section>}
  </div>;
}
