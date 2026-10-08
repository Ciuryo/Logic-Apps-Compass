# Logic Apps Compass

## Estado inicial
Repositório inspecionado em 06/10/2026: diretório vazio, sem Git, stack, componentes, testes, lint ou package manager preexistentes. Node 22.22.3 e npm 10.9.8 disponíveis. Trabalho no diretório solicitado; não há histórico que exija worktree.

## Convenções
- Next.js App Router, TypeScript strict, npm e package-lock.json.
- Identificadores e nomes de arquivos em inglês; interface e comentários úteis em português brasileiro.
- Não usar `any`. Modelar dados externos como `unknown` e validar antes do uso.
- Parser, grafo, regras, sanitização e diagnóstico são locais e independentes de React e IA.
- Não modificar o workflow original. Não enviar payloads automaticamente. Exigir prévia sanitizada e envio explícito.
- Segredos de provedores somente no servidor e no ambiente; sem logs de payloads.
- Referências somente oficiais e verificadas, ou marcadas como pendentes.
- Alterações de domínio exigem testes de comportamento; interface exige verificação responsiva.

## Verificação
`npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run build`.

## Estado implementado
Quatro jornadas funcionais, seis exemplos de workflow, sete erros educacionais, 18 documentos, 13 aulas e oito templates. Parser/rules/graph, Doctor, redaction e providers estão separados da UI. Sem chave, Mock identificado e ferramentas locais funcionam. Revisão inicial com quatro correções de regressão concluída e fontes curadas integradas. Atualização de 07/10/2026 adicionou OpenRouter gratuito e NVIDIA Build para avaliação, seletor por envio e nova prévia ao trocar destino. OpenRouter recusa modelos pagos; sem fallback silencioso. Verificação atual: 200 testes unitários/integração, 36 testes de interface em seis larguras contra produção, lint, typecheck e build passaram. Audit inicial zero, sem dependências alteradas. Provedores reais têm teste de contrato, sem validação autenticada externa. Consulte README.md e docs/verification.md para limites e evidências.

ESLint usa configuração direta com TypeScript, React Hooks e JSX a11y. Dependências diretas têm versões exatas e package-lock.json. Preservar o original, não truncar contexto autorizado sem aviso e não remover os testes de segredos citados ou priorização de erros reais.

## Organização
`src/lib` contém domínio; `src/features` contém experiências; `src/content` contém material educacional; `src/components` contém estrutura e componentes acessíveis compartilhados. Consulte PLANS.md para progresso real.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
