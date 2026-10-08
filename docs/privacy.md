# Privacidade

Workflows e erros são processados no navegador, em memória. Não são armazenados em localStorage; apenas IDs das aulas concluídas. O JSON original é exibido somente ao usuário e não é alterado. Não há analytics ou logs de payloads.

O assistente exige seleção do provedor e do contexto, sanitização, prévia e ação explícita para enviar. Segredos são ocultados por padrão; CPF, CNPJ, e-mail e telefone têm opção adicional. A rota de IA repete a sanitização. Com Mock, a resposta é local ao servidor da aplicação e não chega a provedor externo. Com OpenRouter, NVIDIA Build, OpenAI ou Azure OpenAI configurado, somente a mensagem e o contexto aprovado são enviados ao provedor selecionado, acompanhados das instruções e referências públicas da base curada. Trocar o provedor invalida a prévia; não há fallback silencioso nem envio ao abrir o painel.

Redaction baseada em padrões não garante descobrir todo dado confidencial. A prévia permite revisão manual. Nomes de recursos e lógica de negócio podem ser sensíveis mesmo sem tokens. O consentimento não é persistente e cada solicitação exige envio. Chaves ficam em `.env.local` no servidor, nunca no bundle do navegador. Para uso por várias pessoas, controles de acesso, limites distribuídos e política de retenção do provedor precisam ser avaliados antes de exposição pública.
