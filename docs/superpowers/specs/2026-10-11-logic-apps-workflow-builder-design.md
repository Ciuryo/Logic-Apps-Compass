# Logic Apps Workflow Builder — Design

**Date:** 2026-10-11

**Status:** Especificação aprovada pelo usuário em 11/10/2026; plano de implementação preparado para revisão.

## Objetivo

Adicionar ao Logic Apps Compass um agente que ajude iniciantes a descrever uma integração em português, faça perguntas quando faltarem informações e gere um workflow Azure Logic Apps Consumption revisável e empacotado em ARM. A pessoa continua responsável por revisar e implantar o arquivo no Azure.

O recurso evolui a jornada existente **Quero criar**, sem substituir a proposta de arquitetura determinística já disponível.

## Decisões aprovadas

- O primeiro formato é **Consumption com template ARM**.
- APIs externas serão representadas por ações HTTP genéricas; conectores específicos ficam fora deste MVP.
- O agente só pode gerar operações que estejam no conjunto suportado abaixo.
- Dados de autenticação são placeholders de parâmetros seguros; a interface nunca pede nem envia valores de credenciais.
- A IA cria um plano estruturado; código local determinístico gera WDL e ARM.
- Todo envio externo requer prévia sanitizada e consentimento explícito por envio.
- O Compass não cria recursos, conexões nem implanta arquivos no Azure.

## Experiência

1. Em **Quero criar**, a pessoa escolhe entre a proposta de arquitetura atual e **Gerar workflow para Consumption**.
2. Ela descreve o evento, o resultado esperado, os sistemas/APIs envolvidos e regras relevantes em texto livre. O app informa para não incluir tokens, senhas ou chaves.
3. O agente pode retornar `needs-input` com perguntas objetivas ou `ready` com um plano tipado. Cada resposta da pessoa inicia um novo envio e exige nova prévia sanitizada e autorização explícita.
4. Antes do envio, a pessoa pode conferir a mensagem e o contexto sanitizados, escolher um provedor configurado e autorizar o envio. A conversa permanece em memória durante a sessão, sem `localStorage`.
5. Um plano pronto é exibido com resumo, gatilho, operações, parâmetros, suposições e itens não bloqueadores. A pessoa confirma o plano antes de solicitar a geração local.
6. O Compass mostra a definição WDL e o template ARM gerados. O usuário baixa `azuredeploy.json` e `README.md` com os passos de implantação e configuração. Não há botão que implante ou chame APIs do Azure.

O provedor Mock não deve fingir compreender a descrição nem gerar um pacote personalizado. Sem um provedor real configurado, a tela explica a limitação e preserva o acesso aos exemplos e à proposta local existente.

## Escopo de geração

### Gatilhos

- `Request` com entrada HTTP e contrato JSON explicitamente informado ou confirmado.
- `Recurrence` com frequência e intervalo explicitamente informados ou confirmados.

### Ações

- `Http`, com método HTTP permitido, endpoint HTTPS, headers e body JSON tipados.
- `Compose`, com valor literal ou referências tipadas a campos do gatilho ou de ações anteriores.
- `Response`, somente para workflows iniciados por `Request`.

As ações são sequenciais. O modelo não escreve expressões WDL arbitrárias. Referências de dados usam uma representação intermediária tipada que o gerador converte para expressões conhecidas.

### APIs e autenticação

Métodos permitidos no MVP: `GET`, `POST`, `PUT`, `PATCH` e `DELETE`. Endpoints, métodos e contratos propostos pela IA precisam estar presentes na entrada fornecida ou ser confirmados pela pessoa antes de exportar. Headers usam nomes e valores validados; dados dinâmicos usam referências tipadas, nunca trechos de expressão fornecidos pelo modelo.

- A pessoa fornece ou confirma host, caminho, método, contrato de entrada e demais detalhes exigidos pela operação. O agente não inventa endpoints, schemas, métodos ou respostas.
- Somente HTTPS é aceito no artefato gerado. URLs com usuário/senha, fragmentos ou parâmetros de query com aparência de segredo são rejeitadas.
- Autenticação no MVP: sem autenticação, Bearer token ou chave em header nomeado. A chave/tokens aparecem somente como parâmetro `securestring` sem valor no WDL e ARM; o ARM solicita o valor durante a implantação.
- Para ações HTTP autenticadas, o WDL também oculta inputs e outputs no histórico de execução. O README explica que isso protege os dados da execução e reduz a visibilidade desses detalhes para diagnóstico.
- Valores reais de credenciais não podem ser colocados na descrição, plano intermediário, WDL ou arquivos baixados. A sanitização da prévia e do servidor continua ativa.
- Managed Identity, OAuth interativo, conectores gerenciados, OpenAPI importado, triggers de serviços externos e APIs com esquemas ainda não representáveis ficam fora do MVP e devem resultar em pergunta ou pendência, nunca em aproximação silenciosa.

### Fora do escopo

- Geração Standard, conectores específicos, custom connectors, loops, branches, Switch, scopes de erro, retry customizado e workflows múltiplos.
- Login Azure, criação de API connections, validação de acesso ao endpoint, execução de workflow ou implantação direta.
- Certificação de que todo artefato será implantável em qualquer assinatura, região ou API externa.

## Arquitetura

### Plano intermediário

`src/lib/workflow-builder` contém tipos, esquema e validação puros, independentes de React e IA. O contrato da resposta do modelo é estrito e discriminado por `status`:

- `needs-input`: resumo, perguntas, suposições e itens desconhecidos; não contém artefato exportável.
- `ready`: nome, gatilho, ações suportadas, referências tipadas, autenticação por enum e observações; todos os campos obrigatórios foram fornecidos ou confirmados. Pode conter observações não bloqueadoras que a pessoa precisa revisar antes de confirmar. Não contém WDL, ARM, expressões livres, credenciais nem URLs de referência não verificadas.

O parse do resultado do provedor usa `unknown` seguido de validação Zod. Campos extras, operações desconhecidas, referências inválidas, nomes fora dos limites, endpoints inseguros ou contratos incompletos impedem a geração.

### Provedor e fronteira de privacidade

Uma rota `POST /api/workflow-builder` valida tamanho, provedor, consentimento literal e contrato. Reutiliza os adapters existentes do servidor, mantém chaves exclusivamente em variáveis de ambiente e envia somente mensagem/contexto apresentados na prévia e autorizados pela pessoa. Não registra payloads. Não há fallback silencioso para outro modelo. Respostas do modelo são dados não confiáveis e não são usadas para executar operações externas.

O catálogo de provedores existente informa disponibilidade sem revelar segredos ou detalhes privados do ambiente. Mock continua claramente identificado e não simula uma geração personalizada.

### Gerador local

Um gerador puro recebe somente o plano validado e produz:

- `azuredeploy.json`: template ARM para `Microsoft.Logic/workflows` com uma definição WDL Consumption, template parameters e referências entre parâmetros ARM e parâmetros do workflow.
- `README.md`: finalidade, limitações, parâmetros exigidos, passo de implantação manual e avisos para confirmar autenticação e contratos.

Parâmetros de autenticação usam `securestring`, não têm valor padrão secreto e nunca são preenchidos a partir do chat. Para HTTP autenticado, o workflow também define `runtimeConfiguration.secureData` para ocultar inputs/outputs no histórico. O arquivo ARM não inclui `$connections` nem recursos de conexões porque o MVP usa HTTP genérico.

### Validação

Antes de exibir o download, o Compass valida o plano, gera os arquivos, analisa a definição produzida com o parser local e aplica verificações semânticas específicas do subconjunto. O painel separa erros bloqueadores, suposições e recomendações. O parser local não é apresentado como validador completo da plataforma Azure; a revisão final ocorre no portal/designer durante a implantação manual.

## Erros e estados

- Sem provedor real configurado: instrução para configurar OpenRouter/NVIDIA ou outro provider existente; nenhuma chamada externa.
- Provedor indisponível ou resposta truncada: mensagem segura, sem eco de payload, sem tentativa com outro provider e sem arquivo parcialmente gerado.
- JSON inválido ou contrato de saída inválido: bloquear a geração, apresentar falha de validação e permitir revisar a descrição ou tentar novo envio após prévia e consentimento.
- Requisitos fora do subconjunto ou insuficientes: retornar perguntas/pendências e não habilitar download.
- Falha do gerador/parser/validação semântica: não oferecer arquivo para implantação; preservar o plano na sessão para correção.

## Testes e critérios de aceite

- Testes unitários de plano intermediário: `needs-input`, `ready`, rejeição de campos extras e operações não suportadas, referências, nomes, métodos, HTTPS e autenticação.
- Testes do gerador: forma ARM Consumption e WDL para Request/Response e Recurrence/HTTP; parâmetros seguros com referência correta e sem valores reais; inputs/outputs ocultos em ações autenticadas; bloqueio de dados inválidos; não mutação do plano.
- Testes de integração da rota: consentimento ausente, corpo grande, provedor inexistente/não configurado, resposta inválida do modelo, redaction e ausência de chamadas quando bloqueada. Sem logs de payloads ou fallback.
- Testes E2E: seleção da jornada, prévia sanitizada, envio autorizado, perguntas pendentes, confirmação do plano, validação, visualização e download; layout em 320, 360, 390, 768, 1024 e 1440 px.
- O fluxo existente de proposta de arquitetura permanece funcional.
- Lint, TypeScript strict, testes unitários/integração, E2E e build passam conforme os comandos de `AGENTS.md`.

## Limitações e riscos conhecidos

- A IA pode entender incorretamente uma descrição; aprovação do plano e validações locais são obrigatórias antes do download.
- O subconjunto inicial não cobre todos os conectores, expressões, autenticações nem recursos de Logic Apps.
- A validação local comprova apenas os contratos conhecidos pelo Compass. A implantação precisa de revisão no Azure e autorização para credenciais/conexões.
- A pessoa deve revisar custos, permissões, payloads e comportamento de retry no destino antes de produção.

## Referências oficiais

- [Workflow Definition Language schema](https://learn.microsoft.com/en-us/azure/logic-apps/workflow-definition-language-schema) — estrutura JSON de triggers, actions e parâmetros.
- [Deploy Consumption workflows with ARM templates](https://learn.microsoft.com/en-us/azure/logic-apps/quickstart-create-deploy-azure-resource-manager-template) — deployment ARM aplicável a Consumption.
- [Secure access and data in workflows](https://learn.microsoft.com/en-us/azure/logic-apps/set-up-security-permissions) — parâmetros seguros de workflow e ARM para credenciais.
- [Create parameters for workflow inputs](https://learn.microsoft.com/en-us/azure/logic-apps/create-parameters-workflows) — comportamento de parâmetros Consumption e tipos seguros.
- [Call REST APIs with HTTP Swagger](https://learn.microsoft.com/en-us/azure/connectors/connectors-native-http-swagger) — referência para ações HTTP e operações REST.
