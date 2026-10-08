import type { ParsedWorkflow, WorkflowGraph } from "@/types/workflow";
export function buildWorkflowGraph(workflow: ParsedWorkflow): WorkflowGraph {
  const ranks = new Map(workflow.actions.map((action) => [action.id, 0]));
  const incoming = new Map(workflow.actions.map((action) => [action.id, 0]));
  const outgoing = new Map<string, string[]>();
  for (const dependency of workflow.dependencies) {
    incoming.set(dependency.target, (incoming.get(dependency.target) ?? 0) + 1);
    outgoing.set(dependency.source, [...(outgoing.get(dependency.source) ?? []), dependency.target]);
  }
  const queue = workflow.actions.filter((action) => incoming.get(action.id) === 0).map((action) => action.id);
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index];
    for (const target of outgoing.get(id) ?? []) {
      ranks.set(target, Math.max(ranks.get(target) ?? 0, (ranks.get(id) ?? 0) + 1));
      incoming.set(target, (incoming.get(target) ?? 1) - 1);
      if (incoming.get(target) === 0) queue.push(target);
    }
  }
  const rows = new Map<number, number>();
  return {
    nodes: workflow.actions.map((action) => {
      const rank = ranks.get(action.id) ?? 0;
      const row = rows.get(rank) ?? 0;
      rows.set(rank, row + 1);
      return { id: action.id, type: "default", position: { x: rank * 280, y: row * 180 }, data: { label: `${action.branch ? `${action.branch} · ` : ""}${action.name}`, action } };
    }),
    edges: workflow.dependencies.map((dependency, index) => ({ id: `edge-${index}-${dependency.source}-${dependency.target}`, source: dependency.source, target: dependency.target, label: dependency.structural ? dependency.label : dependency.statuses.join(" / "), data: { statuses: [...dependency.statuses], structural: dependency.structural } }))
  };
}
