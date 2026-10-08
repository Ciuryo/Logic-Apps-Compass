# Ativar IA gratuita

Os dois provedores aparecem no seletor **Provedor de IA** do assistente. Chaves ficam somente no servidor; o navegador não tem campo de chave nem armazena credenciais. Sem chave, escolha **Demonstração local**.

## OpenRouter

1. Entre no [OpenRouter e crie uma chave](https://openrouter.ai/settings/keys).
2. Copie `.env.example` para `.env.local` se este arquivo ainda não existir. Preencha nele:

```dotenv
OPENROUTER_API_KEY=sua_chave
OPENROUTER_MODEL=openrouter/free
```

3. Reinicie o servidor. No assistente, selecione **OpenRouter · gratuito**, escreva a pergunta, prepare a prévia e autorize o envio sanitizado.

Para torná-lo o padrão, defina `AI_PROVIDER=openrouter`. O seletor pode mudar o destino de cada envio sem alterar essa variável.

O [roteador gratuito](https://openrouter.ai/openrouter/free) escolhe entre modelos gratuitos disponíveis. A aplicação aceita esse roteador ou IDs completos terminados em `:free` e recusa modelos pagos antes de enviar. Não há fallback pago, retry automático ou troca silenciosa de provedor. A disponibilidade, o modelo escolhido e a qualidade podem variar. [Limites da conta e de modelos gratuitos](https://openrouter.ai/docs/api_reference/limits) continuam aplicáveis; falhas de cota não ativam outro destino.

## NVIDIA Build

1. Entre no [NVIDIA Build e crie uma chave](https://build.nvidia.com/settings/api-keys). O [quickstart oficial](https://docs.api.nvidia.com/nim/re/docs/api-quickstart) explica cadastro e participação no Developer Program.
2. Preencha `.env.local`:

```dotenv
NVIDIA_API_KEY=sua_chave
NVIDIA_MODEL=nvidia/nemotron-3-ultra-550b-a55b
```

3. Reinicie o servidor e selecione **NVIDIA Build · avaliação** no assistente. Para torná-lo o padrão, use `AI_PROVIDER=nvidia`.

Em 07/10/2026, o [catálogo oficial do Nemotron 3 Ultra](https://build.nvidia.com/nvidia/nemotron-3-ultra-550b-a55b) informa endpoint gratuito disponível. A [referência do modelo](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-ultra-550b-a55b) lista português brasileiro e raciocínio configurável. A integração desativa o raciocínio separado e mostra somente a resposta textual final.

Esse é acesso para desenvolvimento e avaliação, sujeito à disponibilidade e aos limites definidos pela NVIDIA. A [FAQ](https://docs.api.nvidia.com/nim/re/docs/faq) e os [termos do serviço de avaliação](https://assets.ngc.nvidia.com/products/api-catalog/legal/NVIDIA%20API%20Trial%20Terms%20of%20Service.pdf) descrevem essas condições. Não há promessa de acesso ilimitado, quantidade fixa de créditos ou gratuidade de produção. Alterar `NVIDIA_MODEL` exige conferir acesso e condições do modelo na sua conta.

## Privacidade e verificação

Trocar o provedor invalida a prévia. Cada envio inclui o destino escolhido, consentimento explícito e conteúdo revisado; o servidor sanitiza novamente. As respostas são sanitizadas, e links fora da base curada ficam pendentes de verificação. Os provedores recebem também os resumos e referências públicas da base local para orientar a resposta.

OpenRouter usa `https://openrouter.ai/api/v1/chat/completions`; NVIDIA usa `https://integrate.api.nvidia.com/v1/chat/completions`, ambos com timeout de 60 segundos, sem seguir redirects. A existência de variáveis indica configuração local, não comprova que a chave seja válida ou que haja cota. Não envie sua chave no chat ou no contexto do assistente.

A integração é verificada com contratos HTTP controlados e testes de interface. Inferência autenticada, disponibilidade da conta e compatibilidade do toggle de raciocínio no endpoint hospedado permanecem sem verificação até configurar uma chave real.
