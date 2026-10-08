import { diagnoseError } from "@/lib/diagnostics";
import { redactContent } from "@/lib/security/redaction";
import type { AiProvider, AiRequest, AiResponse } from "./types";
import { modeSources } from "./sources";

export class MockAiProvider implements AiProvider {
  async sendMessage(request: AiRequest): Promise<AiResponse> {
    if (request.consent !== true) throw new Error("É necessário autorizar o envio deste contexto.");
    const context = redactContent(request.context).content;
    const diagnosis = request.mode === "Debug" ? diagnoseError(context) : undefined;
    const sources = request.mode === "Debug" ? diagnosis?.documentationReferences ?? [] : modeSources(request.mode);
    const guidance = {
      Explain: "Leia primeiro o trigger, que inicia a execução. Depois siga as actions e seus status de Run After. Selecione uma action no Analyzer para ver inputs, dependências e explicação local.",
      Review: "Consulte os Pontos de atenção do Analyzer. Problemas confirmados têm evidências; recomendações heurísticas precisam ser avaliadas no contexto da integração. Revise autenticação, retry e caminhos de falha.",
      Build: "Defina origem, destino, volume e requisito de resposta. Use o planejador para uma proposta inicial e o catálogo de templates como referência educacional. Valide segurança, limites e testes antes de implantar.",
      Debug: diagnosis ? `${diagnosis.summary}\n\nPassos recomendados:\n${diagnosis.investigationChecklist.map((item, index) => `${index + 1}. ${item}`).join("\n")}\n\nPossíveis correções:\n${diagnosis.possibleFixes.join("\n")}` : "",
      Teach: "Comece por Trigger e Action, depois pratique com um fluxo simples de Request/Response. Avance para Condition, Scope e Run After. Execute os exercícios locais e compare sua resposta com a explicação da aula.",
    };
    return {
      provider: "MockAiProvider", mock: true,
      answer: `Resposta simulada · orientação local, sem chamada a um provedor de IA.\n\n${guidance[request.mode]}\n\nPonto de atenção: essa orientação não verifica seu ambiente Azure nem garante suporte de uma configuração. Confirme as hipóteses no Run History e na documentação oficial.\n\nFontes:\n${sources.map((source) => `${source.title}: ${source.url}`).join("\n")}`,
      sources,
    };
  }
}
