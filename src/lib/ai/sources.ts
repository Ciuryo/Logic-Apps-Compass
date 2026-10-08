import { knowledgeDocuments, type KnowledgeDocument } from "@/content/knowledge";
import { diagnoseError } from "@/lib/diagnostics";
import type { DocumentationReference } from "@/types/workflow";
import type { AiMode } from "./types";

type VerifiableDocument = KnowledgeDocument & { pending?: boolean };

export function verifiedKnowledgeDocuments(documents: readonly VerifiableDocument[] = knowledgeDocuments): VerifiableDocument[] {
  return documents.filter((document) => {
    if (!document.officialSource || !document.lastVerifiedAt || document.pending || !document.sourceUrl) return false;
    try {
      const url = new URL(document.sourceUrl);
      return url.protocol === "https:" && url.hostname === "learn.microsoft.com" && !url.username && !url.password;
    } catch { return false; }
  });
}

function documentationReference(document: KnowledgeDocument): DocumentationReference {
  return { title: document.title, url: document.sourceUrl, lastVerifiedAt: document.lastVerifiedAt };
}

export function uniqueReferences(references: DocumentationReference[]): DocumentationReference[] {
  const seen = new Set<string>();
  return references.filter((reference) => {
    if (!reference.url || reference.pending || seen.has(reference.url)) return false;
    seen.add(reference.url);
    return true;
  });
}

export const curatedKnowledgeDocuments = verifiedKnowledgeDocuments();
export const curatedSources = uniqueReferences([
  ...curatedKnowledgeDocuments.map(documentationReference),
  ...diagnoseError("").documentationReferences,
]);

export function modeSources(mode: Exclude<AiMode, "Debug">): DocumentationReference[] {
  const selectedIds: Record<Exclude<AiMode, "Debug">, string[]> = {
    Explain: ["structure", "triggers", "actions", "run-after"],
    Review: ["security", "identity", "retry", "scopes"],
    Build: ["overview", "hosting", "testing", "deployment"],
    Teach: ["triggers", "actions", "scopes", "run-after"],
  };
  return uniqueReferences(curatedKnowledgeDocuments.filter((document) => selectedIds[mode].includes(document.id)).map(documentationReference));
}
