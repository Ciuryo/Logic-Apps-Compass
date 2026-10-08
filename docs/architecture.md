# Arquitetura

Next.js App Router serve a interface e a rota de IA. React client components mantêm dados de análise apenas em memória. TypeScript strict e Zod validam fronteiras. Tailwind CSS e primitives Radix oferecem componentes acessíveis; React Flow renderiza o grafo.

Fluxo: JSON original → validação → parser recursivo → modelo normalizado → engine de regras + grafo → interface. O original permanece separado. Diagnóstico usa classificação local. Contexto escolhido → redaction → prévia → envio explícito → rota com validação e redaction → provider configurado → resposta com fontes curadas.

## Fronteiras
- `lib/logic-apps`: parser, graph, rules, explanations.
- `lib/security/redaction`: sanitização pura de JSON e texto.
- `lib/diagnostics`: extração e classificação determinística.
- `lib/ai`: contratos, prompts e providers server-only; Mock disponível sem configuração.
- `lib/architecture`: recomendação conceitual do wizard.
- `content`: conhecimento, aulas e templates locais.
- `features`: UI por jornada; `components`: shell e UI compartilhados.

## Limites
Não executar WDL, validar conectividade externa, acessar Azure ou simular execução. O grafo representa dependências e estrutura, não tempos reais. A revisão de segurança é orientativa e baseada no arquivo. Falta de retry explícito não significa ausência de retry padrão. Sem chave de IA, apoio local demonstrativo identificado.
