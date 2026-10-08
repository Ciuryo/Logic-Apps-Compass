# Logic Apps Compass — especificação do MVP

Central interna em português para uma equipe iniciante em Azure Logic Apps. Quatro jornadas: Quero criar, Quero entender, Deu erro e Quero aprender. Templates educacionais e assistente contextual complementam as jornadas.

## Decisões
Aplicação local Next.js com npm. Análise e diagnóstico em memória no navegador; progresso de aulas no localStorage, sem autenticação ou banco de dados. Não há deploy ou escrita no Azure. IA é opcional, com MockAiProvider identificado; provedores reais são configurados no servidor. Um wizard determinístico produz uma proposta, nunca uma decisão definitiva ou custo exato.

## Analyzer
Entrada por arquivo, drag-and-drop, JSON colado ou seis exemplos. Validar sintaxe e definição, suportar definição direta, `definition`, `properties.definition` e recursos ARM de Logic Apps. Extrair triggers, actions recursivas, Scope, If/Condition, Foreach, Until, Switch/cases/default e runAfter multistatus. Preservar tipos desconhecidos. IDs pelo caminho JSON evitam colisões entre nomes locais. Limites de arquivo, quantidade e profundidade produzem estados explícitos. Resumo, grafo, findings filtráveis e original imutável. Hosting desconhecido é declarado sem inferência indevida.

## Engine e Doctor
Funções puras com evidência, caminho, recomendação, confiança e fontes. Achados distinguem observação determinística, recomendação heurística e hipótese. Sem nota numérica. Doctor aceita JSON, body e texto; procura status, code, message, innerError e dados de execução, oferecendo causas prováveis, checklist, correções e informações faltantes.

## Privacidade
Sanitizar segredos em estruturas e texto, inclusive headers, tokens, JWT, cookies, connection strings, SAS e URLs. PII opcional. Antes da IA: prévia editável, consentimento explícito limitado ao contexto atual; sanitização adicional no servidor. Sem telemetria de payload ou persistência de workflows.

## Conteúdo
18 documentos verificados da Microsoft, 13 aulas com exercício e resposta comentada e 8 templates educacionais com diagrama, JSON, segurança e testes. Fontes mostram data de verificação. Conteúdo local curado; sem busca online automática.

## Interface e aceite
Identidade clara com sidebar recolhível, navegação móvel em drawer, painel opcional de assistente, foco visível, mensagens acessíveis, redução de movimento e severidade textual. Larguras 320, 360, 390, 768, 1024 e 1440 sem overflow. Grafo com zoom, pan, fit e tela cheia; detalhes de actions acessíveis também por lista. Testar parser, grafo, regras, erros, redaction e jornadas por Playwright. Lint, types, unit, interface e build devem passar.
