"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRight, BookOpen, Braces, Check, ChevronLeft, ChevronRight, Compass, Files, GitBranch, Home, Layers, LockKeyhole, Menu, MessageSquare, PanelLeftClose, PanelLeftOpen, Plus, ShieldCheck, Sparkles, Stethoscope, Waypoints, X, Zap, type LucideIcon } from "lucide-react";
import { Badge, Button, cn } from "./ui";
import { WorkflowAnalyzer } from "@/features/workflow-analyzer";
import { Diagnostics } from "@/features/diagnostics";
import { AssistantPanel, type AssistantContext } from "@/features/assistant";
import { ArchitectureWizard } from "@/features/architecture-wizard";
import { LearningCenter } from "@/features/learning";
import { TemplateCatalog } from "@/features/templates";

type Journey = "home" | "build" | "analyze" | "doctor" | "learn" | "templates";
const navigation: { id: Journey; title: string; icon: LucideIcon }[] = [
  { id: "home", title: "Visão geral", icon: Home },
  { id: "build", title: "Quero criar", icon: Plus },
  { id: "analyze", title: "Quero entender", icon: GitBranch },
  { id: "doctor", title: "Deu erro", icon: Stethoscope },
  { id: "learn", title: "Quero aprender", icon: BookOpen },
  { id: "templates", title: "Templates", icon: Files }
];
const journeys: { id: Journey; title: string; text: string; icon: LucideIcon; tag: string }[] = [
  { id: "build", title: "Quero criar", text: "Responda algumas perguntas e receba uma proposta de arquitetura para sua integração.", icon: Waypoints, tag: "PLANEJAR" },
  { id: "analyze", title: "Quero entender", text: "Envie ou cole um workflow e veja o que cada etapa faz.", icon: GitBranch, tag: "EXPLORAR" },
  { id: "doctor", title: "Deu erro", text: "Cole o erro da execução e receba um diagnóstico orientado.", icon: Stethoscope, tag: "DIAGNOSTICAR" },
  { id: "learn", title: "Quero aprender", text: "Aprenda Logic Apps com conteúdos curtos e exercícios práticos.", icon: BookOpen, tag: "APRENDER" }
];

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className="brand"><span className="brand-symbol"><Compass size={23} aria-hidden="true" /></span>{!compact && <div className="brand-name">Logic Apps<span>COMPASS</span></div>}</div>;
}

function Overview({ onNavigate }: { onNavigate: (journey: Journey) => void }) {
  return <>
    <div className="hero">
      <div><div className="eyebrow"><span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor" }} /> SUA CENTRAL DE INTEGRAÇÕES</div>
        <h1>Clareza para cada etapa<br />da sua <span>integração.</span></h1>
        <p>Do primeiro workflow ao diagnóstico de uma execução.<br className="hidden sm:block" /> Explore Azure Logic Apps com ferramentas que ajudam você a entender o caminho.</p>
      </div>
      <div className="hero-art" aria-hidden="true"><div className="hero-line" /><div className="flow-tile first"><Zap size={17} color="#347959" /> Trigger</div><div className="flow-tile second"><Layers size={17} color="#57769b" /> Processar</div><div className="flow-tile third"><Check size={17} color="#347959" /> Integração concluída</div></div>
    </div>
    <div className="section-heading"><h2 style={{ fontSize: 16 }}>Por onde vamos começar?</h2><span className="small muted hidden sm:block">Uma ferramenta para cada momento</span></div>
    <div className="journey-grid">{journeys.map(({ id, title, text, icon: Icon, tag }, index) => <button className="journey-card" key={id} onClick={() => onNavigate(id)} aria-label={`${title} — ${text}`}>
      <div className="journey-top"><span className="journey-icon"><Icon size={22} aria-hidden="true" /></span><span className="journey-step">0{index + 1} / {tag}</span></div>
      <h2>{title}</h2><p>{text}</p><ArrowRight size={17} className="arrow" aria-hidden="true" />
    </button>)}</div>
    <div className="home-bottom">
      <section className="panel"><div className="section-heading"><h2 style={{ fontSize: 15 }}>Ferramentas, com contexto</h2><Badge>ANÁLISE LOCAL</Badge></div>
        {[{ icon: Braces, title: "Seu JSON vira um mapa", text: "Visualize etapas, dependências e estruturas aninhadas." }, { icon: ShieldCheck, title: "Revisão com evidências", text: "Pontos de atenção explicados, sem pontuações arbitrárias." }, { icon: MessageSquare, title: "Um assistente quando precisar", text: "Revise o conteúdo sanitizado e escolha o que enviar." }].map(({ icon: Icon, title, text }) => <div className="quick-row" key={title}><span className="quick-icon"><Icon size={18} aria-hidden="true" /></span><div><h3 style={{ fontSize: 12 }}>{title}</h3><p>{text}</p></div></div>)}
      </section>
      <section className="panel" style={{ background: "#eff6f0" }}><div className="eyebrow"><BookOpen size={14} aria-hidden="true" /> PRIMEIROS PASSOS</div><h2 style={{ fontSize: 21, maxWidth: 280 }}>Toda boa integração começa pelo básico.</h2><p className="muted small" style={{ marginTop: 12, marginBottom: 22 }}>Trigger, Action, Scope e Run After: uma trilha com exemplos e exercícios, no seu ritmo.</p><Button variant="secondary" onClick={() => onNavigate("learn")}>Explorar a trilha <ArrowRight size={14} aria-hidden="true" /></Button></section>
    </div>
    <footer className="home-footer"><span><LockKeyhole size={12} aria-hidden="true" /> Análises locais. Seus dados ficam sob seu controle.</span><span>Azure Logic Apps · MVP educacional</span></footer>
  </>;
}

export function CompassApplication() {
  const [journey, setJourney] = useState<Journey>("home");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantContext, setAssistantContext] = useState<AssistantContext>({ label: "Conceitos de Logic Apps", content: "", mode: "Teach" });
  const [assistantVersion, setAssistantVersion] = useState(0);
  const [templateInput, setTemplateInput] = useState<string | undefined>();
  const current = navigation.find((item) => item.id === journey)!;

  function navigate(next: Journey) {
    setJourney(next); setMobileOpen(false);
    setAssistantContext({ label: navigation.find((item) => item.id === next)!.title, content: "", mode: next === "doctor" ? "Debug" : next === "build" ? "Build" : next === "learn" ? "Teach" : "Explain" });
    setAssistantVersion((value) => value + 1);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function setContext(context: AssistantContext) { setAssistantContext(context); setAssistantVersion((value) => value + 1); }
  function askAssistant(context: AssistantContext) { setContext(context); setAssistantOpen(true); }
  function navItems(compact: boolean) { return navigation.map(({ id, title, icon: Icon }) => <button key={id} className={cn("nav-button", journey === id && "active")} onClick={() => navigate(id)} title={compact ? title : undefined} aria-label={title} aria-current={journey === id ? "page" : undefined}><Icon size={18} aria-hidden="true" />{!compact && title}</button>); }

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Ir para o conteúdo principal</a>
    <aside className={cn("sidebar", collapsed && "sidebar-collapsed")}><Brand compact={collapsed} />{!collapsed && <div className="nav-caption">Navegação</div>}<nav aria-label="Principal">{navItems(collapsed)}</nav>
      <div className="sidebar-bottom">{!collapsed && <div className="local-card"><strong><ShieldCheck size={14} aria-hidden="true" /> Ambiente local</strong>Análise e diagnóstico funcionam sem chave de IA.</div>}<Button variant="ghost" className={collapsed ? "icon-button" : "w-full"} onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expandir menu" : "Recolher menu"}>{collapsed ? <PanelLeftOpen size={17} aria-hidden="true" /> : <><PanelLeftClose size={17} aria-hidden="true" /> Recolher menu</>}</Button></div>
    </aside>
    <div className="app-body"><header className="topbar"><Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}><Dialog.Trigger asChild><Button variant="ghost" className="icon-button desktop-hidden" aria-label="Abrir menu"><Menu size={21} aria-hidden="true" /></Button></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="mobile-drawer"><Dialog.Title className="sr-only">Navegação</Dialog.Title><Dialog.Description className="sr-only">Escolha uma jornada no Logic Apps Compass.</Dialog.Description><div className="flex-row" style={{ justifyContent: "space-between" }}><Brand /><Dialog.Close asChild><Button variant="ghost" className="icon-button" aria-label="Fechar menu"><X size={20} aria-hidden="true" /></Button></Dialog.Close></div><nav aria-label="Menu móvel">{navItems(false)}</nav><div className="notice" style={{ marginTop: 25 }}>Análise local e apoio opcional por IA.</div></Dialog.Content></Dialog.Portal></Dialog.Root>
      <div className="breadcrumb"><span className="workspace-label">Área de trabalho</span><ChevronRight size={12} className="workspace-label" aria-hidden="true" /><strong>{current.title}</strong></div>
      <div className="topbar-actions"><Badge tone="success" className="local-badge"><span style={{ width: 5, height: 5, background: "currentColor", borderRadius: 99 }} /> Análise local</Badge><Button variant="secondary" onClick={() => setAssistantOpen(true)} aria-label="Abrir assistente"><Sparkles size={15} aria-hidden="true" /><span className="assistant-top-label">Assistente</span></Button></div>
    </header>
    <main id="main-content" className="main-content" tabIndex={-1}>
      {journey !== "home" && <div className="eyebrow"><Button variant="ghost" className="icon-button" aria-label="Voltar à visão geral" onClick={() => navigate("home")}><ChevronLeft size={15} aria-hidden="true" /></Button> {journey === "analyze" ? "WORKFLOW ANALYZER" : journey === "doctor" ? "LOGIC APPS DOCTOR" : journey === "build" ? "PLANEJAMENTO DE ARQUITETURA" : journey === "learn" ? "TRILHA DE APRENDIZAGEM" : "CATÁLOGO EDUCACIONAL"}</div>}
      {journey === "home" && <Overview onNavigate={navigate} />}
      {journey === "analyze" && <WorkflowAnalyzer initialInput={templateInput} onContext={setContext} onAskAssistant={askAssistant} />}
      {journey === "doctor" && <Diagnostics onContext={setContext} onAskAssistant={askAssistant} />}
      {journey === "build" && <ArchitectureWizard />}
      {journey === "learn" && <LearningCenter />}
      {journey === "templates" && <TemplateCatalog onOpenTemplate={(json) => { setTemplateInput(json); navigate("analyze"); }} />}
    </main></div>
    <AssistantPanel key={assistantVersion} open={assistantOpen} onOpenChange={setAssistantOpen} context={assistantContext} />
  </div>;
}
