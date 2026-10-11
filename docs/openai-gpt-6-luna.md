# OpenAI GPT-6 Luna

O Logic Apps Compass pode usar `gpt-6-luna` pela OpenAI Responses API no assistente e no construtor de workflows. Essa integração usa uma chave da API no servidor; não autentica pela sessão do Codex ou do ChatGPT.

## Configuração

1. Crie uma chave em [OpenAI API Keys](https://platform.openai.com/api-keys).
2. Coloque-a no `.env.local`, que não deve ser enviado ao Git:

```dotenv
OPENAI_API_KEY=sua_chave
OPENAI_MODEL=gpt-6-luna
```

`OPENAI_MODEL` é opcional; se ficar vazio, o servidor usa `gpt-6-luna`. Reinicie a aplicação e escolha **OpenAI · GPT-6 Luna (padrão, pago)** no seletor. O envio ainda exige revisar a prévia sanitizada e autorizar cada solicitação.

## Cobrança e limites

O modelo é cobrado por tokens. A documentação consultada em 11/10/2026 informa US$ 0,10 por milhão de tokens de entrada e US$ 0,50 por milhão de tokens de saída, além de condições próprias para cache, contexto longo e processamento. A API não oferece nível gratuito para esse modelo. Confira os [preços atuais](https://developers.openai.com/api/docs/pricing) e os [limites de conta](https://developers.openai.com/api/docs/models/gpt-6-luna) antes de ativar.

## Segurança e verificação

A chave permanece no servidor. Não a coloque no código, em variáveis `NEXT_PUBLIC_`, na pergunta ou no contexto do workflow. A aplicação sanitiza a entrada e a resposta, desativa o armazenamento da resposta (`store: false`) e não registra payloads. A configuração mostra apenas se a chave existe; não confirma validade, créditos ou acesso à conta. A integração é coberta por testes de contrato sem chave real; uma chamada autenticada ainda depende de uma chave da conta.

Referências oficiais: [GPT-6 Luna na OpenAI API](https://developers.openai.com/api/docs/models/gpt-6-luna), [referência da Responses API](https://platform.openai.com/docs/api-reference/responses), [preços da API](https://developers.openai.com/api/docs/pricing).
