'use client';

import { useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Compass, Network, RotateCcw } from 'lucide-react';
import { architectureQuestions, buildArchitectureProposal, type ArchitectureAnswers } from '@/lib/architecture';
import { knowledgeLink } from '@/content/knowledge';
import { WorkflowBuilder } from '@/features/workflow-builder';

const stages = ['Cenário e entrada', 'Execução e rede', 'Ambiente e sistemas', 'Confiabilidade'];

export function ArchitectureWizard() {
  const [journey, setJourney] = useState<'choose' | 'architecture' | 'workflow'>('choose');
  const [answers, setAnswers] = useState<ArchitectureAnswers>({});
  const [stage, setStage] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [error, setError] = useState('');
  const questions = architectureQuestions.filter(question => question.stage === stage);
  const proposal = showResult ? buildArchitectureProposal(answers) : null;

  function advance() {
    const missing = questions.find(question => !answers[question.key]?.trim());
    if (missing) {
      setError(`Responda: ${missing.label}`);
      document.getElementById(`architecture-${missing.key}`)?.focus();
      return;
    }
    setError('');
    if (stage === stages.length - 1) setShowResult(true);
    else setStage(stage + 1);
  }

  if (journey === 'workflow') return <WorkflowBuilder onBack={() => setJourney('choose')} />;

  if (journey === 'choose') return <section className="stack" aria-labelledby="architecture-title">
    <div><p className="eyebrow">QUERO CRIAR</p><h1 id="architecture-title">Dê forma à sua integração</h1><p className="muted">Escolha como quer começar. Você pode explorar uma proposta local ou montar um pacote de Logic Apps Consumption.</p></div>
    <div className="grid-two" aria-label="Escolha uma jornada">
      <button className="panel stack" aria-label="Proposta de arquitetura" style={{ textAlign: 'left', gap: 9 }} onClick={() => setJourney('architecture')}>
        <span className="eyebrow" style={{ marginBottom: 0 }}>PROPOSTA LOCAL</span>
        <strong style={{ fontSize: 18 }}>Proposta de arquitetura</strong>
        <span className="muted">Responda às perguntas e receba uma recomendação sem enviar dados para um provedor.</span>
      </button>
      <button className="panel stack" aria-label="Criar workflow Consumption" style={{ textAlign: 'left', gap: 9 }} onClick={() => setJourney('workflow')}>
        <span className="eyebrow" style={{ marginBottom: 0 }}>CONSUMPTION</span>
        <strong style={{ fontSize: 18 }}>Criar workflow Consumption</strong>
        <span className="muted">Descreva a automação, revise cada envio e gere arquivos para revisar e importar manualmente.</span>
      </button>
    </div>
    <p className="muted">A criação do pacote não implanta recursos Azure. Revise os contratos e parâmetros antes de importar.</p>
  </section>;

  return <section className="stack" aria-labelledby="architecture-title">
    <div><p className="eyebrow">QUERO CRIAR</p><h1 id="architecture-title">Dê forma à sua integração</h1><p className="muted">13 perguntas simples. Uma proposta local para discutir com sua equipe.</p></div>
    {!proposal ? <>
      <ol className="grid-two" style={{ listStyle: 'none', padding: 0 }} aria-label="Etapas da proposta">{stages.map((label, index) => <li key={label} className="panel" style={{ padding: '14px 18px', borderColor: index === stage ? '#17745b' : undefined }} aria-current={index === stage ? 'step' : undefined}><span className="badge">{index + 1}</span> <strong>{label}</strong>{index < stage && <CheckCircle2 size={16} aria-label="Etapa respondida" style={{ verticalAlign: 'middle', marginLeft: 8 }} />}</li>)}</ol>
      <div className="panel stack" style={{ padding: 'clamp(18px, 4vw, 32px)' }}>
        <div><p className="eyebrow">ETAPA {stage + 1} DE 4</p><h2>{stages[stage]}</h2></div>
        {questions.map(question => <div className="stack" key={question.key} style={{ gap: 8 }}>
          <label htmlFor={`architecture-${question.key}`}><strong>{question.label}</strong></label>
          <p className="muted" id={`architecture-hint-${question.key}`} style={{ margin: 0 }}>{question.hint}</p>
          {question.options ? <select id={`architecture-${question.key}`} className="field" value={answers[question.key] ?? ''} aria-describedby={`architecture-hint-${question.key}`} onChange={event => { setAnswers({ ...answers, [question.key]: event.target.value }); setError(''); }}><option value="">Selecione uma opção</option>{question.options.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select> : <input id={`architecture-${question.key}`} className="field" value={answers[question.key] ?? ''} maxLength={500} aria-describedby={`architecture-hint-${question.key}`} placeholder={question.key === 'event' ? 'Ex.: novo pedido recebido' : 'Ex.: sistema de pedidos e API de faturamento'} onChange={event => { setAnswers({ ...answers, [question.key]: event.target.value }); setError(''); }} />}
        </div>)}
        {error && <p className="notice" role="alert">{error}</p>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' }}><button className="button-secondary" disabled={stage === 0} onClick={() => { setStage(stage - 1); setError(''); }}><ArrowLeft size={17} aria-hidden="true" /> Anterior</button><button className="button" onClick={advance}>{stage === 3 ? 'Gerar proposta' : 'Continuar'} <ArrowRight size={17} aria-hidden="true" /></button></div>
      </div>
      <p className="muted"><Compass size={16} aria-hidden="true" style={{ verticalAlign: 'middle' }} /> Suas respostas ficam nesta sessão. Nenhum recurso Azure será criado.</p>
    </> : <>
      <div className="notice" role="status">Proposta gerada por regras locais. Use como ponto de partida e valide requisitos, capacidade e suporte dos conectores.</div>
      <div className="panel stack" style={{ padding: 24 }}><p className="eyebrow">SEU CENÁRIO</p><h2><Network size={22} aria-hidden="true" /> Proposta de arquitetura</h2><p>{proposal.summary}</p><p>{proposal.architecture}</p><div className="notice"><strong>Hosting sugerido: {proposal.hosting.option === 'Undetermined' ? 'não foi possível determinar' : proposal.hosting.option}</strong><p>{proposal.hosting.reason}</p></div><p><strong>Modo de execução:</strong> {proposal.workflowMode}</p><p><strong>Trigger:</strong> {proposal.trigger}</p></div>
      <div className="grid-two">{([{ title: 'Principais actions', value: proposal.actions }, { title: 'Dúvidas ainda abertas', value: proposal.unknowns.length ? proposal.unknowns : ['Confirmar limites dos serviços, contratos e operação com a equipe.'] }] as const).map(section => <div key={section.title} className="panel" style={{ padding: 24 }}><h2>{section.title}</h2><ul>{section.value.map(item => <li key={item}>{item}</li>)}</ul></div>)}</div>
      <div className="grid-two">{[{ title: 'Tratamento de erro', value: proposal.errorHandling }, { title: 'Retry e indisponibilidade', value: proposal.retry }, { title: 'Segurança', value: proposal.security }, { title: 'Monitoramento', value: proposal.monitoring }, { title: 'Idempotência', value: proposal.idempotency }, { title: 'Ordem e concorrência', value: proposal.ordering }].map(section => <div className="panel" style={{ padding: 24 }} key={section.title}><h2>{section.title}</h2><p>{section.value}</p></div>)}</div>
      <div className="panel" style={{ padding: 24 }}><h2>Checklist de implementação</h2><ol>{proposal.checklist.map(item => <li key={item}>{item}</li>)}</ol><h3>Esqueleto conceitual</h3><pre style={{ overflowX: 'auto', maxWidth: '100%', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}><code>{proposal.conceptualSkeleton}</code></pre></div>
      <div className="panel" style={{ padding: 24 }}><h2>Fatores de custo e referências</h2><p>{proposal.costFactors}</p><div className="stack" style={{ gap: 8 }}>{['hosting', 'identity', 'retry', 'monitoring'].map(id => { const link = knowledgeLink(id); return <a key={id} href={link.url} target="_blank" rel="noreferrer">{link.title} — Microsoft Learn</a>; })}<a href="https://azure.microsoft.com/en-us/pricing/calculator/" target="_blank" rel="noreferrer">Calculadora oficial do Azure</a></div><p className="muted">Referências verificadas em 06/10/2026.</p></div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}><button className="button-secondary" onClick={() => setShowResult(false)}><ArrowLeft size={17} aria-hidden="true" /> Rever respostas</button><button className="button-ghost" onClick={() => { setAnswers({}); setStage(0); setShowResult(false); setError(''); }}><RotateCcw size={17} aria-hidden="true" /> Nova proposta</button></div>
    </>}
  </section>;
}
