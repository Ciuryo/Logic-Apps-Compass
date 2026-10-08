"use client";

import { useState } from "react";
import { AlertTriangle, CircleAlert, Info, ShieldCheck } from "lucide-react";
import { Badge, CodeBlock } from "@/components/ui";
import type { Finding } from "@/types/workflow";

const categories: Record<Finding["category"], string> = { security: "Segurança", reliability: "Confiabilidade", maintainability: "Manutenibilidade", observability: "Observabilidade", performance: "Performance", data: "Dados" };
const severities = { info: "Informação", warning: "Atenção", critical: "Crítico" };
const confidence = { high: "Alta", medium: "Média", low: "Baixa" };

export function FindingCard({ finding }: { finding: Finding }) {
  const Icon = finding.severity === "critical" ? CircleAlert : finding.severity === "warning" ? AlertTriangle : Info;
  const kind = finding.type === "deterministic" ? "Observação confirmada" : finding.confidence === "low" ? "Hipótese para investigar" : "Recomendação";
  return <article className={`panel finding-card ${finding.severity}`} data-testid="finding-card">
    <div className="finding-meta"><Badge tone={finding.severity === "critical" ? "critical" : finding.severity === "warning" ? "warning" : "neutral"}><Icon size={12} aria-hidden="true" />{severities[finding.severity]}</Badge><Badge>{categories[finding.category]}</Badge><Badge tone={finding.type === "deterministic" ? "success" : "neutral"}>{kind}</Badge></div>
    <h3>{finding.title}</h3><p className="muted">{finding.description}</p>
    {finding.workflowPath && <code className="finding-path">{finding.workflowPath}</code>}
    <details><summary>Ver evidência e recomendação</summary>{finding.evidence && <><h4 style={{ fontSize: 12, marginBottom: 8 }}>Evidência</h4><CodeBlock>{finding.evidence}</CodeBlock></>}<p style={{ marginTop: 12 }}><strong>Por que importa: </strong>{finding.whyItMatters}</p><p style={{ marginTop: 9 }}><strong>Como revisar: </strong>{finding.recommendation}</p><p className="muted" style={{ marginTop: 9 }}>Confiança: {confidence[finding.confidence]}. {finding.type === "heuristic" && "Esta sugestão depende do cenário e deve ser validada."}</p><div className="source-links">{finding.documentationReferences.map((source) => source.url ? <a key={source.title} href={source.url} target="_blank" rel="noreferrer">{source.title}</a> : <span key={source.title}>{source.title} · referência pendente</span>)}</div></details>
  </article>;
}

export function Findings({ findings }: { findings: Finding[] }) {
  const [category, setCategory] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [type, setType] = useState("all");
  const visible = findings.filter((finding) => (category === "all" || category === finding.category) && (severity === "all" || severity === finding.severity) && (type === "all" || type === finding.type));
  return <div className="stack">
    <div className="notice">Observações confirmadas descrevem o JSON fornecido. Recomendações e hipóteses sugerem revisões e precisam do contexto da integração. A análise não verifica recursos no Azure.</div>
    <div><div className="findings-filter"><div className="input-group"><label htmlFor="finding-category">Filtrar categoria</label><select id="finding-category" className="field" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">Todas as categorias</option>{Object.entries(categories).map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></div><div className="input-group"><label htmlFor="finding-severity">Filtrar severidade</label><select id="finding-severity" className="field" value={severity} onChange={(event) => setSeverity(event.target.value)}><option value="all">Todas as severidades</option>{Object.entries(severities).map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></div><div className="input-group"><label htmlFor="finding-type">Filtrar natureza</label><select id="finding-type" className="field" value={type} onChange={(event) => setType(event.target.value)}><option value="all">Todas as naturezas</option><option value="deterministic">Observações confirmadas</option><option value="heuristic">Recomendações e hipóteses</option></select></div></div><p className="small muted" aria-live="polite">{visible.length} de {findings.length} pontos de atenção</p></div>
    {visible.map((finding) => <FindingCard finding={finding} key={finding.id} />)}
    {!visible.length && <div className="panel empty-state"><ShieldCheck size={28} color="#17745b" aria-hidden="true" /><h3>Nenhum ponto neste filtro</h3><p>Isso não certifica o workflow. Teste o comportamento e revise as configurações do ambiente.</p></div>}
  </div>;
}
