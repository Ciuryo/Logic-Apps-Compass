export interface ArchitectureAnswers {
  event?: string;
  entry?: string;
  volume?: string;
  immediateResponse?: string;
  asynchronous?: string;
  privateNetwork?: string;
  stateful?: string;
  localDevelopment?: string;
  onPremises?: string;
  systems?: string;
  ordered?: string;
  duplicates?: string;
  outage?: string;
}
export interface ArchitectureQuestion {
  key: keyof ArchitectureAnswers;
  label: string;
  hint: string;
  stage: number;
  options?: { value: string; label: string }[];
}
const yesNo = [{ value: 'yes', label: 'Sim' }, { value: 'no', label: 'Não' }, { value: 'unknown', label: 'Ainda não sei' }];
export const architectureQuestions: ArchitectureQuestion[] = [
  { key: 'event', label: 'Qual evento inicia o fluxo?', hint: 'Ex.: pedido recebido, arquivo criado ou fechamento diário.', stage: 0 },
  { key: 'entry', label: 'O fluxo será chamado por HTTP, agenda, fila ou evento?', hint: 'Escolha a forma de entrada.', stage: 0, options: [{ value: 'http', label: 'Chamada HTTP' }, { value: 'schedule', label: 'Agenda' }, { value: 'queue', label: 'Fila' }, { value: 'event', label: 'Evento' }, { value: 'unknown', label: 'Ainda não sei' }] },
  { key: 'volume', label: 'Qual é o volume aproximado?', hint: 'Precisaremos validar picos, tamanho e duração em um teste.', stage: 0, options: [{ value: 'low', label: 'Baixo ou esporádico' }, { value: 'medium', label: 'Moderado e recorrente' }, { value: 'high', label: 'Alto ou com picos' }, { value: 'unknown', label: 'Ainda não sei' }] },
  { key: 'immediateResponse', label: 'Existe necessidade de resposta imediata?', hint: 'O chamador precisa receber o resultado do processamento?', stage: 1, options: yesNo },
  { key: 'asynchronous', label: 'O processamento pode ser assíncrono?', hint: 'O trabalho pode terminar depois da confirmação de recebimento?', stage: 1, options: yesNo },
  { key: 'privateNetwork', label: 'Existe necessidade de rede privada?', hint: 'Algum destino só aceita acesso por uma rede restrita?', stage: 1, options: yesNo },
  { key: 'stateful', label: 'O fluxo precisa manter estado?', hint: 'Há esperas, recuperação durável ou histórico persistido?', stage: 1, options: yesNo },
  { key: 'localDevelopment', label: 'Existe necessidade de desenvolvimento e testes locais?', hint: 'A equipe pretende usar o runtime local de Standard?', stage: 2, options: yesNo },
  { key: 'onPremises', label: 'Existem sistemas on-premises?', hint: 'Sistemas hospedados no ambiente da sua empresa.', stage: 2, options: yesNo },
  { key: 'systems', label: 'Quais sistemas serão integrados?', hint: 'Descreva os sistemas, sem URLs privadas ou credenciais.', stage: 2 },
  { key: 'ordered', label: 'Os eventos precisam ser processados em ordem?', hint: 'Um evento posterior depende do anterior?', stage: 3, options: yesNo },
  { key: 'duplicates', label: 'Existe risco de mensagens duplicadas?', hint: 'Reenvios e retries podem gerar a mesma entrada mais de uma vez.', stage: 3, options: yesNo },
  { key: 'outage', label: 'Qual é o comportamento esperado quando um sistema externo estiver indisponível?', hint: 'Defina uma saída operacional para falhas prolongadas.', stage: 3, options: [{ value: 'retry', label: 'Tentar novamente com limite' }, { value: 'queue', label: 'Guardar para reprocessar' }, { value: 'fail', label: 'Falhar e avisar um responsável' }, { value: 'unknown', label: 'Ainda não sei' }] },
];

export interface ArchitectureProposal {
  summary: string;
  architecture: string;
  workflowMode: string;
  hosting: { option: 'Standard' | 'Consumption' | 'Undetermined'; reason: string };
  unknowns: string[];
  trigger: string;
  actions: string[];
  errorHandling: string;
  retry: string;
  security: string;
  monitoring: string;
  idempotency: string;
  ordering: string;
  checklist: string[];
  conceptualSkeleton: string;
  costFactors: string;
}
const known = (value: string | undefined): boolean => Boolean(value?.trim() && value !== 'unknown');

export function buildArchitectureProposal(answers: ArchitectureAnswers): ArchitectureProposal {
  const unknowns = architectureQuestions.filter(question => !known(answers[question.key])).map(question => question.label);
  let hosting: ArchitectureProposal['hosting'] = { option: 'Undetermined', reason: 'Não há informação suficiente para recomendar hosting. Confirme rede, desenvolvimento local e carga, e compare conectores e limites.' };
  if (answers.privateNetwork === 'yes' || answers.localDevelopment === 'yes') {
    hosting = { option: 'Standard', reason: 'Avaliar Standard: rede privada e desenvolvimento local são requisitos que favorecem seu runtime. Ainda é necessário validar conectores, topologia, plano, capacidade e região.' };
  } else if (answers.privateNetwork === 'no' && answers.localDevelopment === 'no' && answers.volume === 'low') {
    hosting = { option: 'Consumption', reason: 'Avaliar Consumption para carga esporádica sem requisito declarado de rede privada ou runtime local; validar conectores, limites, segurança e operação antes da decisão.' };
  } else if (known(answers.privateNetwork) && known(answers.localDevelopment) && known(answers.volume)) {
    unknowns.push('Qual é a taxa de pico, duração e tamanho médio da mensagem para dimensionar e comparar hosting?');
  }
  if (answers.immediateResponse === 'yes' && answers.entry !== 'http') unknowns.push('Como oferecer resposta imediata quando a entrada não é HTTP? Considere um endpoint de recepção separado.');
  if (answers.immediateResponse === 'yes' && answers.asynchronous === 'yes') unknowns.push('O chamador aceita confirmação 202 com consulta posterior ou exige o resultado final na mesma chamada?');
  if (answers.onPremises === 'yes') unknowns.push('O conector escolhido requer gateway, VPN ou outra conectividade para o sistema on-premises?');
  if (answers.stateful === 'no' && answers.outage === 'queue') unknowns.push('Onde o estado de reprocessamento será persistido fora de um workflow Stateless?');
  const triggers: Record<string, string> = { http: 'Request (HTTP), com contrato e autenticação definidos.', schedule: 'Recurrence (agenda), com frequência e fuso configurados.', queue: 'Trigger de fila compatível com o serviço escolhido; confirmar semântica de recebimento e conclusão.', event: 'Trigger do serviço de eventos escolhido; confirmar contrato e entrega.' };
  const asynchronous = answers.asynchronous === 'yes' || answers.entry === 'queue';
  return {
    summary: `Evento: ${answers.event?.trim() || 'não informado'}. Sistemas: ${answers.systems?.trim() || 'não informados'}. Volume: ${answers.volume === 'high' ? 'alto ou com picos' : answers.volume === 'medium' ? 'moderado' : answers.volume === 'low' ? 'baixo ou esporádico' : 'não informado'}.`,
    architecture: asynchronous ? 'Recepção → validação → fila ou armazenamento durável → processamento → confirmação e monitoramento. Separar recepção e execução reduz o acoplamento ao tempo do destino.' : 'Recepção → validação → transformação → chamada ao destino → resposta. Medir o tempo total e revisar a espera do chamador antes de adotar um fluxo síncrono.',
    workflowMode: answers.stateful === 'yes' ? 'Avaliar execução Stateful para preservar estado durável e permitir esperas e recuperação, observando limites e retenção. A escolha do modo é separada da escolha de hosting.' : answers.stateful === 'no' ? 'Em Standard, avaliar Stateless apenas para execução curta sem necessidade de estado durável; confirmar limites, comportamento de falha e estratégia de diagnóstico. Consumption não oferece a mesma escolha de modo Stateless.' : 'É necessário confirmar a duração, esperas e necessidade de estado durável antes de sugerir um modo de execução.',
    hosting, unknowns, trigger: triggers[answers.entry ?? ''] ?? 'A definir após confirmar o evento e o mecanismo de entrada.',
    actions: ['Validar contrato da entrada', 'Obter identificador de correlação', 'Verificar chave de idempotência antes de efeitos externos', 'Transformar dados para o contrato do destino', 'Executar operação compatível com o sistema integrado', asynchronous ? 'Concluir mensagem somente após processamento durável' : 'Responder conforme o contrato do chamador'],
    errorHandling: `Separar Try, Catch e Finally com Scopes. Catch observa Failed e TimedOut; Finally cobre os estados relevantes, inclusive Skipped. ${answers.outage === 'queue' ? 'Persistir falhas para reprocessamento com limite e fila de mensagens não processadas.' : answers.outage === 'fail' ? 'Falhar de forma explícita e acionar o responsável com contexto sanitizado.' : 'Após esgotar as tentativas, registrar contexto sanitizado e encaminhar para intervenção.'}`,
    retry: 'Para falhas transitórias e operações compatíveis, avaliar retry exponencial com tentativas e duração limitadas; respeitar orientação de throttling do destino. Não repetir cegamente erros de contrato ou autorização. Repetir gravações apenas com idempotência definida.',
    security: 'Preferir Managed Identity quando a operação e o destino suportarem. Conceder permissões mínimas, usar HTTPS e proteger inputs/outputs sensíveis. Manter segredos em configuração segura; validar autenticação do trigger e acesso de rede.',
    monitoring: 'Relacionar execuções por correlation ID. Alertar sobre falhas, duração e backlog; definir responsável, retenção e procedimento de recuperação. Avaliar Application Insights para Standard e diagnóstico no Azure Monitor sem payloads completos.',
    idempotency: answers.duplicates === 'yes' ? 'Persistir uma chave de negócio estável em armazenamento persistente com criação atômica e estados de processamento. Reutilizar a chave em retries, definir expiração e recuperação de execução interrompida.' : 'Confirmar a semântica de entrega e reenvio. Mesmo sem duplicatas previstas, verificar efeitos repetidos durante retry e definir uma chave de negócio quando necessário.',
    ordering: answers.ordered === 'yes' ? 'Se usar Azure Service Bus, avaliar sessões para ordenar por entidade de negócio. Concorrência e retries devem respeitar a mesma chave; confirmar suporte do trigger selecionado. Serializar tudo pode reduzir capacidade.' : 'Definir concorrência por destino e evitar dependências implícitas entre mensagens. Ordem global não foi declarada como requisito.',
    checklist: ['Confirmar contrato e limites do trigger', 'Comparar hosting e disponibilidade de conectores na região', 'Definir parâmetros e conexões por ambiente', 'Configurar identidade, permissões e proteção de dados', 'Implementar Scopes e caminho de falha', 'Definir chave de idempotência e recuperação', 'Testar duplicata, timeout, 429, indisponibilidade e entrada inválida', 'Configurar alertas e responsável operacional', 'Validar capacidade com carga representativa', 'Revisar deployment e rollback em ambiente de teste'],
    conceptualSkeleton: JSON.stringify({ conceptual: true, note: 'Esqueleto de planejamento; adaptar ao contrato e aos conectores. Não é uma definição implantável.', trigger: triggers[answers.entry ?? ''] ?? 'A definir', stages: { Validate: ['Contrato', 'Correlation ID', 'Idempotência'], Try: ['Transformar', 'Integrar', 'Confirmar'], Catch: { runAfter: ['Failed', 'TimedOut'], actions: ['Registrar contexto sanitizado', 'Encaminhar recuperação'] }, Finally: { runAfter: ['Succeeded', 'Failed', 'TimedOut', 'Skipped'], actions: ['Métrica de conclusão'] } } }, null, 2),
    costFactors: 'O consumo depende de hosting, execuções, actions, conectores, armazenamento, rede, telemetria e retenção. Validar hipóteses na calculadora oficial do Azure; esta proposta não estima custo exato.',
  };
}
