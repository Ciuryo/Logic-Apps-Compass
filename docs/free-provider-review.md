# Revisão independente — provedores gratuitos

Data: 07/10/2026. Escopo: Task 6 de `PLANS.md`, contrato em `docs/free-provider-backend-brief.md`, tipos/factory/adapters de IA, rota do assistente, painel, testes associados, `.env.example`, README e guia de ativação. Revisão somente leitura da implementação; este relatório é o único arquivo editado pelo revisor.

## Veredito

**Aprovado no escopo de código e contratos revisados. Nenhum achado concreto bloqueador identificado.** A aprovação não afirma funcionamento autenticado dos serviços externos nem substitui a verificação final de build e interface do integrador.

## Evidências

| Propriedade | Evidência revisada |
| --- | --- |
| Escolha explícita por envio | `src/lib/ai/types.ts` define os cinco IDs e provider opcional; `src/lib/ai/index.ts:8` prioriza a escolha explícita. O padrão por `AI_PROVIDER`, o alias `azure-openai` e pedidos antigos sem provider permanecem aceitos. |
| Validação antes da chamada | `src/app/api/assistant/route.ts:8` exige enum válido, `consent: true`, pergunta/contexto limitados e objeto estrito. Provedor desconhecido retorna 400; configuração indisponível retorna 503 antes de qualquer chamada externa. |
| Modelos gratuitos OpenRouter | `src/lib/ai/providers.ts:10` aceita somente `openrouter/free` ou ID completo `provider/model:free`. A factory verifica a configuração e o construtor repete a validação em `:128`; os testes cobrem sete modelos pagos/inválidos sem fetch. |
| Sem troca silenciosa de destino | A factory escolhe um único adapter. Erros não criam outro provider e não repetem a requisição. Testes de falha 429 em OpenRouter/NVIDIA verificam uma única chamada e resposta 502 segura, mesmo com padrão Mock. |
| Credenciais no servidor | O painel importa somente tipos de `src/lib/ai/types.ts`; os imports executáveis do módulo de IA estão na rota. O catálogo contém apenas ID, nome público e flags. Chaves e endpoint privado Azure não aparecem no GET, comprovado por teste. O guard em `providers.ts:60` recusa envio no navegador. Não há segredo de exemplo real nem variável `NEXT_PUBLIC_` para credenciais. |
| Consentimento por destino | `src/features/assistant/index.tsx:62` associa provider à prévia; `:65` compara prévia e seleção antes de enviar; `:68` envia esse ID. Alterar destino limpa prévia/resposta em `:79`. O seletor fica bloqueado durante envio e o botão exige configuração válida. Pergunta, modo e opções de contexto também invalidam a prévia. Alterações de contexto da aplicação remontam o painel por `assistantVersion`. |
| Sanitização e fontes | Entrada é sanitizada no painel, na rota e no adapter; saída passa pelo sanitizador comum e pela whitelist de fontes. As instruções acrescentam apenas conhecimento público curado. Os testes confirmam remoção de segredos de pergunta/contexto/resposta e exclusão de links inventados. |
| Contrato Chat Completions | Endpoints HTTPS fixos, Bearer, mensagens system/user, `stream: false`, `max_tokens: 1800`; NVIDIA recebe `chat_template_kwargs.enable_thinking: false`. Defaults coincidem com o brief e o guia. |
| Parsing sem resposta parcial | `src/lib/ai/providers.ts:36` recebe `unknown`, exige `choices[0]`, término `stop`, conteúdo textual não vazio e até 30.000 caracteres. Rejeita erro, término ausente/length/content_filter/tool_calls e tool calls não vazios. Não exibe `reasoning_content`. |
| Timeout e erro seguro | O caminho comum usa AbortController e Promise.race, cobrindo fetch e leitura do JSON; limpa o timer em finally. Novos provedores têm 60 segundos; OpenAI/Azure preservam 20 segundos. `redirect: error` e `cache: no-store` permanecem ativos. Corpo HTTP de erro não é lido/ecoado; a rota devolve mensagem genérica. |
| Compatibilidade anterior | OpenAI/Azure continuam no protocolo Responses, com os mesmos endpoints, modelo/deployment, `store: false`, sanitização, instruções curadas e limites. Mock permanece disponível sem chave e identificado como demonstrativo. Testes anteriores desses contratos passaram. |
| Interface e documentação | Há rótulos de avaliação/limites, ajuda de ativação sem campo de chave no navegador e aviso de que configuração não comprova validade/cota. O guia distingue gratuidade de avaliação NVIDIA de produção e registra a ausência de inferência autenticada. Os testes de interface cobrem ambos os provedores, ausência de envio automático, sanitização, troca de destino, falha de status e overflow em seis larguras. |

## Verificação executada pelo revisor

Comando: `npm test -- tests/unit/ai.test.ts tests/unit/ai-free-providers.test.ts tests/integration/assistant.test.ts`.

Resultado em 07/10/2026 às 10:46: **3 arquivos, 82 testes aprovados, código de saída 0**. Chamadas dos providers foram substituídas por respostas HTTP controladas; não houve uso de contas, segredos reais ou inferência externa.

A revisão também inspecionou os imports da árvore `src`, a composição do painel no componente pai, os testes anteriores de IA e os novos testes Playwright. Nenhuma implementação ou teste foi modificado durante a revisão.

## Evidência complementar e limites

O integrador informou **200/200 testes unitários/integração, typecheck, lint sem avisos, build e 36/36 testes Playwright contra produção aprovados**. A execução Playwright levou 30,6 segundos e cobriu seis larguras, de 320 a 1440 pixels. Informou também inspeção das capturas `test-results/assistant-nvidia-320.png` e `test-results/assistant-nvidia-1440.png`, com seletor/ajuda legíveis e sem overflow, e GET real com catálogo público e Mock padrão. Esses resultados não foram repetidos por este revisor. Não foi iniciado outro Playwright para evitar disputa pelo mesmo servidor e pelos relatórios de teste. Segundo o integrador, nenhuma implementação mudou após o build; a alteração posterior foi captura de tela no teste.

A revisão não repetiu a pesquisa online das referências oficiais já verificadas pelo integrador e registradas no guia. Disponibilidade do modelo, cota, validade da chave, comportamento autenticado do endpoint NVIDIA com o toggle de raciocínio e qualidade de respostas em português continuam sem confirmação externa. Acesso gratuito depende das condições vigentes do serviço; a interface e o guia comunicam essa limitação.

Não existe histórico Git para atribuir cada linha a um commit; a revisão avaliou o estado atual contra o brief, a Task 6 e os contratos anteriores presentes nos testes. Os resultados aprovados sustentam os cenários exercitados e não constituem garantia de ausência de defeitos em entradas não testadas.
