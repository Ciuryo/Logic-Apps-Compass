'use client';

import { useEffect, useState } from 'react';
import { BookOpen, Check, CheckCircle2, ExternalLink, Search } from 'lucide-react';
import { lessons } from '@/content/lessons';
import { knowledgeDocuments } from '@/content/knowledge';

const progressKey = 'logic-apps-compass-lesson-progress-v1';

export function LearningCenter() {
  const [completed, setCompleted] = useState<string[]>([]);
  const [storageNotice, setStorageNotice] = useState('');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'lessons' | 'knowledge'>('lessons');
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      try {
        const stored: unknown = JSON.parse(window.localStorage.getItem(progressKey) ?? '[]');
        if (Array.isArray(stored)) setCompleted(stored.filter((id): id is string => typeof id === 'string' && lessons.some(lesson => lesson.id === id)));
      } catch { setStorageNotice('O progresso está disponível nesta sessão; não foi possível ler o armazenamento local.'); }
    });
    return () => { active = false; };
  }, []);
  function toggleCompleted(id: string) {
    const next = completed.includes(id) ? completed.filter(value => value !== id) : [...completed, id];
    setCompleted(next);
    try { window.localStorage.setItem(progressKey, JSON.stringify(next)); setStorageNotice(''); }
    catch { setStorageNotice('Não foi possível salvar no navegador. Seu progresso continua disponível nesta sessão.'); }
  }
  const term = query.trim().toLocaleLowerCase('pt-BR');
  const filteredLessons = lessons.filter(lesson => `${lesson.title} ${lesson.objective} ${lesson.explanation}`.toLocaleLowerCase('pt-BR').includes(term));
  const filteredDocuments = knowledgeDocuments.filter(document => `${document.title} ${document.summary} ${document.topics.join(' ')}`.toLocaleLowerCase('pt-BR').includes(term));

  return <section className="stack" aria-labelledby="learning-title">
    <div><p className="eyebrow">QUERO APRENDER</p><h1 id="learning-title">Um conceito de cada vez</h1><p className="muted">Uma trilha prática para entender, construir e cuidar das suas integrações.</p></div>
    <div className="panel" style={{ padding: 24 }}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}><div><h2>Trilha inicial</h2><p className="muted">13 aulas com exemplos, exercícios e respostas comentadas.</p></div><span className="badge"><CheckCircle2 size={15} aria-hidden="true" /> {completed.length} de 13 concluídas</span></div><progress value={completed.length} max={13} aria-label="Progresso na trilha inicial" style={{ width: '100%', height: 8, accentColor: '#17745b' }} /><p className="muted">Progresso salvo apenas neste navegador.</p>{storageNotice && <p role="status" className="notice">{storageNotice}</p>}</div>
    <div className="tabs" aria-label="Tipo de conteúdo" style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}><button className={tab === 'lessons' ? 'button' : 'button-secondary'} aria-pressed={tab === 'lessons'} onClick={() => setTab('lessons')}><BookOpen size={17} aria-hidden="true" /> Aulas</button><button className={tab === 'knowledge' ? 'button' : 'button-secondary'} aria-pressed={tab === 'knowledge'} onClick={() => setTab('knowledge')}>Base de conhecimento</button></div>
    <div><label htmlFor="learning-search" className="muted"><Search size={16} aria-hidden="true" style={{ verticalAlign: 'middle' }} /> Buscar por assunto</label><input id="learning-search" className="field" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Ex.: retry, segurança, expressão..." /></div>
    {tab === 'lessons' ? <div className="stack">{filteredLessons.length === 0 && <div className="notice" role="status">Nenhuma aula encontrada. Tente outro assunto.</div>}{filteredLessons.map(lesson => {
      const index = lessons.indexOf(lesson) + 1;
      const done = completed.includes(lesson.id);
      return <details className="panel" key={lesson.id} style={{ padding: '18px 22px' }}><summary style={{ cursor: 'pointer', minHeight: 44 }}><span className="badge">{String(index).padStart(2, '0')}</span> <strong>{lesson.title}</strong> {done && <span className="badge"><Check size={14} aria-hidden="true" /> Concluída</span>}<p className="muted" style={{ margin: '8px 0 0' }}>{lesson.objective}</p></summary><div className="stack" style={{ marginTop: 24 }}><p>{lesson.explanation}</p><div className="notice"><strong>Exemplo</strong><p style={{ overflowWrap: 'anywhere' }}>{lesson.example}</p></div><div><h3>Erro comum</h3><p>{lesson.commonMistake}</p></div><details><summary style={{ cursor: 'pointer', minHeight: 44 }}><strong>Praticar: exercício</strong></summary><p>{lesson.exercise}</p><details><summary style={{ cursor: 'pointer', minHeight: 44 }}><strong>Ver resposta comentada</strong></summary><p>{lesson.commentedAnswer}</p></details></details><div><h3>Aprofunde na documentação</h3><div className="stack" style={{ gap: 8 }}>{lesson.officialLinks.map((link, linkIndex) => <a key={`${link.title}-${link.url}-${linkIndex}`} href={link.url} target="_blank" rel="noreferrer">{link.title} <ExternalLink size={14} aria-hidden="true" /></a>)}</div><p className="muted">Fontes oficiais verificadas em 06/10/2026.</p></div><button className={done ? 'button-secondary' : 'button'} onClick={() => toggleCompleted(lesson.id)} aria-pressed={done}><CheckCircle2 size={17} aria-hidden="true" /> {done ? 'Marcar como não concluída' : 'Concluir aula'}</button></div></details>;
    })}</div> : <div className="grid-two">{filteredDocuments.length === 0 && <div className="notice" role="status">Nenhum documento encontrado. Tente outro assunto.</div>}{filteredDocuments.map(document => <article className="panel stack" key={document.id} style={{ padding: 24 }}><div><span className="badge">Microsoft Learn</span><h2>{document.title}</h2></div><p>{document.summary}</p><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{document.topics.map(topic => <span className="badge" key={topic}>{topic}</span>)}</div>{document.sourceUrl ? <a href={document.sourceUrl} target="_blank" rel="noreferrer">Abrir referência oficial <ExternalLink size={14} aria-hidden="true" /></a> : <p className="muted">Referência pendente de verificação.</p>}<p className="muted">Última verificação: {document.lastVerifiedAt === '2026-10-06' ? '06/10/2026' : 'pendente'}</p></article>)}</div>}
  </section>;
}
