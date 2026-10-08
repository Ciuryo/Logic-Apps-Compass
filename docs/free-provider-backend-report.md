# Relatório do backend dos provedores gratuitos

Data: 07/10/2026. Escopo concluído conforme `docs/free-provider-backend-brief.md`.

## Arquivos

- `src/lib/ai/types.ts`: IDs dos cinco provedores, escolha opcional em `AiRequest`, status com `id` e catálogo.
- `src/lib/ai/index.ts`: seleção explícita independente de `AI_PROVIDER`, padrão e alias `azure-openai` preservados, catálogo público sem chaves/endpoints, validação da configuração gratuita OpenRouter.
- `src/lib/ai/providers.ts`: OpenRouter e NVIDIA Build com endpoints fixos; infraestrutura comum de transporte, consentimento, timeout, sanitização e fontes; contratos Responses existentes preservados.
- `src/app/api/assistant/route.ts`: GET do catálogo, POST com enum opcional, recusa de seleção desconhecida e envio somente ao provedor escolhido.
- `tests/unit/ai-free-providers.test.ts`: 55 casos novos de contrato e segurança.
- `tests/integration/assistant.test.ts`: sete casos novos de integração, mantendo os anteriores.

## Evidências RED e GREEN

1. Antes da implementação, `npm test -- tests/integration/assistant.test.ts` falhou em seis dos 15 casos. GET não tinha catálogo; POST com os novos provedores retornava 400 em vez de 200, 503 ou 502. Os nove casos restantes passaram.
2. Antes da implementação, `npm test -- tests/unit/ai-free-providers.test.ts` registrou 55 falhas, incluindo contrato de status sem `id` e ausência dos novos exports/classes. A evidência comportamental da rota acima confirmou a falta da funcionalidade independentemente desses símbolos ausentes.
3. Após implementação, a execução dos três arquivos pertinentes teve 81 casos aprovados e uma falha no teste novo: uma assertion assíncrona não havia sido aguardada. O teste foi corrigido com `await`; nenhuma regra de produção foi alterada para satisfazer essa falha.
4. `npm test` passou: dez arquivos e 200 testes, sem falhas.
5. A integração de UI solicitou o nome público `NVIDIA Build`. Primeiro os testes foram atualizados e três falhas de contrato foram observadas (GET, POST e resposta direta); depois status e provider foram alinhados. Nova execução de `npm test` passou: dez arquivos e 200 testes, sem falhas, às 10:46:20.
6. `npm run typecheck` passou com saída 0. `npx eslint src/lib/ai src/app/api/assistant/route.ts tests/unit/ai-free-providers.test.ts tests/integration/assistant.test.ts` terminou com saída 0, sem erros ou avisos. A verificação completa, build, UI e E2E ficam com a integração principal.

## Revisão própria

- Confirmado envio Chat Completions com mensagens system/user, instruções PT-BR e conhecimento local curado, pergunta/contexto sanitizados, `stream:false` e `max_tokens:1800`.
- OpenRouter permite `openrouter/free` e IDs no formato `provider/model:free`, recusando IDs pagos ou malformados em status/factory e constructor antes de fetch. Não há retry ou fallback de provedor/modelo.
- NVIDIA usa modelo padrão solicitado, permite override no ambiente e desliga thinking via `chat_template_kwargs.enable_thinking:false`. `reasoning_content` nunca entra na resposta.
- Os dois novos provedores têm timeout padrão de 60 segundos, override para teste e abort. Transporte mantém `redirect:error`, `cache:no-store`, guarda de execução no servidor e autorização literal `true`.
- Respostas externas são `unknown`. O leitor aceita apenas texto não vazio da primeira choice com `finish_reason:stop`; rejeita erros, término parcial, filtro, tool calls e payload malformado. Textos acima do limite defensivo de 30.000 caracteres são recusados, sem retorno truncado.
- Sanitização da resposta e whitelist de referências são compartilhadas com Responses. Chaves/endpoints privados não entram no catálogo e corpos de erro não são lidos, registrados ou devolvidos.
- Requests sem `provider` mantêm seleção pelo ambiente/default Mock. OpenAI/Azure mantêm URLs, headers, modelos/deployment, formato Responses e timeout anterior.
- Não foram alterados UI, arquivos de ambiente ou README neste escopo. Sem criação de contas, uso de segredos reais ou inferência externa.

## Limites

Os testes usam fetch simulado e não demonstram autenticação, disponibilidade do modelo, limites de conta ou qualidade de respostas reais. A oferta NVIDIA é avaliação gratuita sujeita a limites; OpenRouter também depende de disponibilidade e limites dos modelos gratuitos. Não há promessa de uso ilimitado. O escopo não muda a prévia/consentimento da interface, cuja integração e verificação responsiva são responsabilidade do agente principal.
