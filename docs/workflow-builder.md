# Construtor de workflows

O construtor fica em **Quero criar** e gera um pacote inicial para Azure Logic Apps **Consumption** a partir de uma descrição em português. Ele ajuda a estruturar o workflow; não cria recursos, não implanta o template e não comprova que uma API ou contrato funcionará no ambiente de destino.

## Jornada e privacidade

Escolha **Criar workflow Consumption**. A proposta de arquitetura determinística continua disponível na outra opção e funciona sem provedor de IA.

Selecione um provedor real configurado no servidor. O modo Mock serve apenas como demonstração e não monta planos personalizados. OpenRouter usa um modelo gratuito configurado; NVIDIA Build é uma opção de avaliação sujeita a disponibilidade e limites. OpenAI oferece GPT-6 Luna pela API paga por uso, sem nível gratuito para esse modelo. Veja [como configurar OpenAI GPT-6 Luna](openai-gpt-6-luna.md) e [como configurar provedores gratuitos](free-ai-providers.md).

Escreva o pedido e escolha **Preparar prévia**. Essa etapa é local: aplica a sanitização, não faz chamada de rede. Revise e, se necessário, edite a prévia da pergunta e o contexto anterior que será enviado. O contexto de uma conversa adicional também é mostrado e editável. Alterar a pergunta original ou o provedor invalida a prévia. Para cada envio, marque a autorização explícita; a autorização é consumida naquele envio e precisa ser dada novamente após erro ou ao preparar outro turno. Conversa, prévia e plano ficam somente na memória da página, sem persistência.

Não cole senhas, tokens, chaves ou dados pessoais. A sanitização usa padrões conhecidos e não detecta todo dado confidencial; faça uma revisão humana. O servidor sanitiza novamente, guarda as chaves dos provedores somente no ambiente e não inclui conteúdo do usuário nos erros ou logs da rota.

## Subconjunto aceito

O plano local aceita um gatilho `Request` ou `Recurrence`; actions `Http`, `Compose` e `Response`; referências tipadas a campos do gatilho ou de actions anteriores; e contratos JSON limitados para requisição e resposta. Um workflow pode ter até 100 actions, no máximo 32 headers por action e nomes simples em inglês. `Response` exige gatilho `Request`, pode ocorrer uma vez e deve ser a última action.

Actions HTTP aceitam `GET`, `POST`, `PUT`, `PATCH` e `DELETE`, URL `https` sem credenciais ou fragmento, headers e body modelados. `GET` não aceita body. Autenticação pode ser nenhuma, Bearer ou header, sempre com placeholder ligado a parâmetro ARM `secureString` sem valor padrão. O gerador marca inputs e outputs de actions HTTP autenticadas para ocultação no histórico de execução.

O modelo retorna somente o plano JSON do domínio. A rota valida sua forma e semântica antes de devolver a resposta; a interface valida novamente antes de mostrar o plano. Referências a saídas HTTP exigem um contrato da resposta. Endpoints não são consultados, testados ou verificados automaticamente: confirme URL, método, headers, autenticação, contratos e permissões com o dono da API.

## Arquivos gerados

Após revisar o gatilho, endpoints, métodos, contratos e autenticação e marcar a confirmação do plano, o Compass gera localmente:

- `workflow.json`: definição do workflow em Workflow Definition Language (WDL).
- `azuredeploy.json`: template ARM com um recurso `Microsoft.Logic/workflows` para Consumption e parâmetros de nome, localização e placeholders seguros.
- `README.md`: passos de revisão e implantação manual.

O pacote só aparece se a validação local da definição WDL e do envelope ARM passar. Essa validação checa o subconjunto implementado; não substitui o validador oficial do Azure nem confirma compatibilidade de runtime, conectividade, permissões, quotas, contrato real da API ou custo. Baixe e revise os arquivos. Importe pelo designer ou implante o template manualmente depois de aprovações e testes da sua organização.

## Fora do escopo

Não são gerados conectores gerenciados, conexões ARM, identidade gerenciada, expressões WDL arbitrárias, condições/branches, loops, scopes, escopos de erro, ações de armazenamento, filas, gateways privados ou configurações completas de rede. O construtor não executa workflow, não acessa contas de provedor ou Azure para validar credenciais e não faz deploy. Se a descrição precisar desses recursos, a IA deve pedir esclarecimentos ou informar que o escopo não é suportado; revise sempre o resultado antes de importar.

## Referências oficiais

- [Referência do recurso Microsoft.Logic/workflows](https://learn.microsoft.com/en-us/azure/templates/microsoft.logic/workflows)
- [Quickstart para implantar workflows Consumption com ARM](https://learn.microsoft.com/en-us/azure/logic-apps/quickstart-create-deploy-azure-resource-manager-template)
- [Parâmetros de workflow e valores seguros](https://learn.microsoft.com/en-us/azure/logic-apps/create-parameters-workflows)
- [Referência do schema WDL e expressões](https://learn.microsoft.com/en-us/azure/logic-apps/workflow-definition-language-schema)
- [Proteger acesso e dados no histórico do workflow](https://learn.microsoft.com/en-us/azure/logic-apps/set-up-security-permissions)
