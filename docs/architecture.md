# Arquitetura

Next.js App Router serve a interface e duas rotas de IA. React client components mantêm análise, conversa e prévia apenas em memória. TypeScript strict e Zod validam fronteiras; o domínio do workflow builder é independente de React e de provedores.

## Fluxos

O analyzer valida o JSON original, converte-o em modelo normalizado e executa parser, grafo e regras locais. O Doctor também classifica erros localmente. Nenhuma dessas jornadas executa WDL, chama conectores ou acessa Azure.

O assistente educacional usa a rota `/api/assistant`. O construtor usa `/api/workflow-builder`: descrição e contexto autorizados → sanitização local → prévia editável da mensagem e de todo o contexto que será enviado → consentimento explícito de uso único → rota com validação estrita e sanitização adicional → perfil de instrução fixo no servidor → resposta JSON validada → confirmação humana do plano → geração e validação locais → prévia e downloads.

O construtor não persiste conversa, prévia, plano ou pacote. Ao editar a pergunta ou trocar provedor, a prévia expira. Cada turno, inclusive uma tentativa após erro ou resposta `needs-input`, precisa de nova prévia e consentimento. A rota valida o provedor e não aceita o Mock para planejamento personalizado. Chaves e configuração de modelos são lidas somente no servidor; o browser recebe um catálogo público de disponibilidade configurada, sem valores de segredo.

## Fronteiras

- `src/lib/logic-apps`: parser recursivo, grafo, regras e explicações determinísticas.
- `src/lib/security/redaction`: sanitização pura de JSON/texto e PII opcional.
- `src/lib/diagnostics`: extração e classificação determinística.
- `src/lib/ai`: contratos, adapters e instruções de provedores; chamadas de rede partem das rotas server-side.
- `src/lib/workflow-builder`: schema estrito, validação semântica do plano, geração WDL/ARM e validação dos artefatos; não importa React ou módulos de IA.
- `src/lib/architecture`: recomendação conceitual local do wizard.
- `src/content`: conhecimento, aulas, templates e exemplos locais.
- `src/features`: UI por jornada; `src/components`: shell e componentes compartilhados.
- `tests`: Vitest para domínio/rotas e Playwright para jornadas e responsividade.

## Limites e validação

O contrato do modelo permite apenas os tipos de gatilho e actions declarados no [guia do construtor](workflow-builder.md). O modelo não escreve WDL ou ARM diretamente: os geradores fazem o mapeamento determinístico do plano validado. Um JSON estruturalmente correto ainda pode ter endpoint, método ou contrato incorretos; o usuário revisa esses dados.

A validação local não consulta o endpoint HTTP, credenciais, API, Azure Resource Manager ou runtime de Logic Apps. Não verifica autenticação real, conectividade, permissões, quotas ou custo. Um endpoint HTTPS sintaticamente válido não é prova de que seja o endpoint correto. O grafo do analyzer mostra estrutura e dependências, não tempos ou resultado real de execução. A sanitização por padrões pode não reconhecer todo dado confidencial.

Para os detalhes e referências oficiais do formato gerado, veja o [guia do construtor](workflow-builder.md), a [referência do recurso Microsoft.Logic/workflows](https://learn.microsoft.com/en-us/azure/templates/microsoft.logic/workflows), a [referência WDL](https://learn.microsoft.com/en-us/azure/logic-apps/workflow-definition-language-schema) e a documentação de [dados seguros do histórico](https://learn.microsoft.com/en-us/azure/logic-apps/set-up-security-permissions).
