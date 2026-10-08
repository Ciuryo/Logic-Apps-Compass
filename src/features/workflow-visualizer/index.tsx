"use client";

import { useMemo, useState } from "react";
import { Background, Controls, Handle, MiniMap, Position, ReactFlow, ReactFlowProvider, useReactFlow, type AriaLabelConfig, type Node, type NodeProps } from "@xyflow/react";
import * as Dialog from "@radix-ui/react-dialog";
import { Focus, Maximize2, MessageSquare, X } from "lucide-react";
import "@xyflow/react/dist/style.css";
import { Badge, Button, CodeBlock, cn } from "@/components/ui";
import { buildWorkflowGraph } from "@/lib/logic-apps/graph";
import { explainAction } from "@/lib/logic-apps/explanations";
import type { AssistantContext } from "@/features/assistant";
import type { Finding, ParsedWorkflow, WorkflowAction } from "@/types/workflow";

type ActionNode = Node<{ label: string; action: WorkflowAction; onSelect: (action: WorkflowAction) => void }, "action">;
function WorkflowNode({ data, selected }: NodeProps<ActionNode>) {
  const container = ["Scope", "If", "Condition", "Foreach", "Until", "Switch"].includes(data.action.type);
  return <div className={cn("workflow-node", selected && "selected", container && "container")}>
    {!data.action.isTrigger && <Handle type="target" position={Position.Top} />}
    <button style={{ border: 0, background: "transparent", padding: 0, textAlign: "left", width: "100%" }} onClick={() => data.onSelect(data.action)} aria-label={`Abrir etapa ${data.action.name}`}><span className="node-type">{data.action.isTrigger ? "Trigger" : data.action.knownType ? data.action.type : `Unknown action type · ${data.action.type}`}</span><span className="node-label">{data.label}</span>{data.action.branch && <span className="node-branch">Ramo: {data.action.branch}</span>}{data.action.depth > 0 && <span className="node-branch" style={{ display: "block" }}>Nível {data.action.depth} · dentro de uma estrutura</span>}</button>
    <Handle type="source" position={Position.Bottom} />
  </div>;
}
const nodeTypes = { action: WorkflowNode };
const graphLabels: Partial<AriaLabelConfig> = {
  "node.a11yDescription.default": "Selecione esta etapa ou use a lista abaixo do grafo para abrir os detalhes.",
  "node.a11yDescription.keyboardDisabled": "Etapa do workflow. Use a lista de etapas para abrir os detalhes.",
  "edge.a11yDescription.default": "Ligação entre etapas do workflow. O texto informa o status esperado ou o ramo.",
  "controls.ariaLabel": "Controles da visualização",
  "controls.zoomIn.ariaLabel": "Aumentar zoom",
  "controls.zoomOut.ariaLabel": "Diminuir zoom",
  "controls.fitView.ariaLabel": "Ajustar grafo à tela",
  "controls.interactive.ariaLabel": "Alternar interação",
  "minimap.ariaLabel": "Minimapa do workflow",
  "handle.ariaLabel": "Ponto de ligação da etapa"
};

function GraphCanvas({ workflow, onSelect }: { workflow: ParsedWorkflow; onSelect: (action: WorkflowAction) => void }) {
  const graph = useMemo(() => buildWorkflowGraph(workflow), [workflow]);
  const nodes: ActionNode[] = graph.nodes.map((node) => ({ ...node, type: "action", data: { ...node.data, onSelect } }));
  const edges = graph.edges.map((edge) => ({ ...edge, type: "smoothstep", style: { stroke: edge.data.structural ? "#afc6b8" : "#5c8b73", strokeDasharray: edge.data.structural ? "5 4" : undefined }, labelStyle: { fontSize: 10, fill: "#405d4c" }, labelBgStyle: { fill: "#fff" }, ariaLabel: `${edge.source} para ${edge.target}: ${edge.label ?? "Estrutura"}` }));
  return <div className="graph-canvas"><ReactFlow<ActionNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView minZoom={0.15} maxZoom={2} onNodeClick={(_, node) => onSelect(node.data.action)} nodesDraggable={false} nodesConnectable={false} deleteKeyCode={null} ariaLabelConfig={graphLabels} proOptions={{ hideAttribution: true }} aria-label="Grafo do workflow" attributionPosition="bottom-right"><Background gap={22} color="#dce8df" /><Controls showInteractive={false} /><MiniMap style={{ width: 120, height: 90 }} pannable zoomable nodeColor={(node) => ["Scope", "If", "Foreach", "Switch"].includes((node.data as ActionNode["data"]).action.type) ? "#b9d9c3" : "#dbe7e0"} /></ReactFlow></div>;
}

function GraphToolbar({ onFullscreen, fullscreen }: { onFullscreen?: () => void; fullscreen?: boolean }) {
  const { fitView } = useReactFlow();
  return <div className="graph-toolbar"><span className="small muted">Arraste para navegar · use zoom para explorar</span><div className="flex-row"><Button variant="secondary" onClick={() => void fitView({ padding: 0.2 })}><Focus size={14} aria-hidden="true" /> Centralizar e ajustar</Button>{!fullscreen && <Button variant="secondary" onClick={onFullscreen}><Maximize2 size={14} aria-hidden="true" /> Tela cheia</Button>}</div></div>;
}

function ActionDetails({ action, workflow, findings, onClose, onAskAssistant }: { action: WorkflowAction; workflow: ParsedWorkflow; findings: Finding[]; onClose: () => void; onAskAssistant: (context: AssistantContext) => void }) {
  const related = findings.filter((finding) => finding.workflowPath === action.path || finding.workflowPath?.startsWith(`${action.path}.`) || finding.workflowPath?.startsWith(`${action.path}[`));
  const dependencies = workflow.dependencies.filter((dependency) => dependency.target === action.id && !dependency.structural);
  return <aside className="panel detail-panel"><div className="section-heading"><h2 style={{ fontSize: 15 }}>Detalhes da etapa</h2><Button variant="ghost" className="icon-button" onClick={onClose} aria-label="Fechar detalhes"><X size={16} aria-hidden="true" /></Button></div><h3 style={{ marginTop: 0, fontSize: 17 }}>{action.name}</h3><Badge>{action.knownType ? action.type : `Unknown action type · ${action.type}`}</Badge><p className="muted" style={{ marginTop: 11 }}>{explainAction(action)}</p><code className="finding-path">{action.path}</code><h3>Dependências</h3>{dependencies.length ? <ul>{dependencies.map((dependency, index) => <li key={index}>{workflow.actions.find((item) => item.id === dependency.source)?.name ?? dependency.source} · {dependency.statuses.join(", ")}</li>)}</ul> : <p className="muted">Sem Run After explícito. Observe a estrutura que contém esta etapa.</p>}<h3>Inputs relevantes</h3><CodeBlock>{action.inputs === undefined ? "Nenhum input declarado." : JSON.stringify(action.inputs, null, 2)}</CodeBlock><h3>Configurações</h3><CodeBlock>{action.configuration === undefined ? "Nenhuma configuração adicional declarada." : JSON.stringify(action.configuration, null, 2)}</CodeBlock>{action.outputs !== undefined && <><h3>Outputs declarados</h3><CodeBlock>{JSON.stringify(action.outputs, null, 2)}</CodeBlock></>}<h3>Achados relacionados</h3>{related.length ? <ul>{related.map((finding) => <li key={finding.id}>{finding.title} · {finding.type === "heuristic" ? "Sugestão" : "Observação"}</li>)}</ul> : <p className="muted">Nenhum achado local associado a esta etapa.</p>}<h3>Trecho original</h3><CodeBlock>{JSON.stringify(action.original, null, 2)}</CodeBlock><Button variant="secondary" style={{ width: "100%", marginTop: 14 }} onClick={() => onAskAssistant({ label: `Action ${action.name}`, content: JSON.stringify({ path: action.path, action: action.original, findings: related }, null, 2), mode: "Explain", question: `Explique a action ${action.name} e suas dependências para uma pessoa iniciante.` })}><MessageSquare size={14} aria-hidden="true" /> Perguntar sobre esta action</Button></aside>;
}

export function WorkflowVisualizer({ workflow, findings, onAskAssistant }: { workflow: ParsedWorkflow; findings: Finding[]; onAskAssistant: (context: AssistantContext) => void }) {
  const [selected, setSelected] = useState<WorkflowAction | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const actions = workflow.actions.filter((action) => !action.isTrigger);
  return <div className="stack"><div className="notice">Linhas contínuas representam Run After, com os status esperados. Linhas tracejadas representam estrutura e entrada em branches. O grafo não simula a execução. Containers têm borda tracejada e o nível aparece em texto.</div><div className={selected ? "graph-split" : ""}>
    <div style={{ minWidth: 0 }}><ReactFlowProvider><div className="graph-wrapper"><GraphToolbar onFullscreen={() => setFullscreen(true)} /><GraphCanvas workflow={workflow} onSelect={setSelected} /></div></ReactFlowProvider><p className="small muted" style={{ marginTop: 15 }}>Alternativa ao grafo: selecione uma etapa pela lista.</p><div className="action-list">{actions.map((action) => <Button key={action.id} variant="secondary" data-testid="action-detail-button" aria-label={`Detalhes de ${action.name} em ${action.branch ?? "fluxo principal"}`} onClick={() => setSelected(action)}>{action.name}</Button>)}</div></div>
    {selected && <ActionDetails action={selected} workflow={workflow} findings={findings} onClose={() => setSelected(null)} onAskAssistant={onAskAssistant} />}
  </div><Dialog.Root open={fullscreen} onOpenChange={setFullscreen}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="fullscreen-content"><div className="section-heading"><Dialog.Title>Visualização do workflow</Dialog.Title><Dialog.Close asChild><Button variant="secondary"><X size={15} aria-hidden="true" /> Sair da tela cheia</Button></Dialog.Close></div><Dialog.Description className="small muted" style={{ marginBottom: 12 }}>Zoom e pan disponíveis por mouse, teclado e toque. Selecione uma etapa para abrir detalhes ao sair da tela cheia.</Dialog.Description><ReactFlowProvider><div className="graph-wrapper" style={{ flex: 1 }}><GraphToolbar fullscreen /><GraphCanvas workflow={workflow} onSelect={(action) => { setSelected(action); setFullscreen(false); }} /></div></ReactFlowProvider></Dialog.Content></Dialog.Portal></Dialog.Root></div>;
}
