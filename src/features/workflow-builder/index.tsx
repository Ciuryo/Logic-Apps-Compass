'use client';

import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { ArrowLeft, Download, ShieldCheck } from 'lucide-react';
import { aiProviderIds, type AiProviderId } from '@/lib/ai/types';
import { redactContent } from '@/lib/security/redaction';
import { generateWorkflowArtifacts, WorkflowGenerationError } from '@/lib/workflow-builder/generate';
import { workflowBuilderResultSchema } from '@/lib/workflow-builder/schema';
import { validateGeneratedWorkflow } from '@/lib/workflow-builder/validate-generated';
import { validateWorkflowPlan } from '@/lib/workflow-builder/validate';
import type { WorkflowBuilderArtifacts, WorkflowBuilderJsonSchema, WorkflowBuilderResult, WorkflowPlan, WorkflowPlanValidationIssue } from '@/lib/workflow-builder/types';

const providerStatusSchema = z.strictObject({
  id: z.enum(aiProviderIds).nullable(),
  provider: z.string().min(1),
  configured: z.boolean(),
  mock: z.boolean(),
});
const providerCatalogSchema = providerStatusSchema.extend({ providers: z.array(providerStatusSchema) }).strict();
const responseSchema = z.strictObject({ result: workflowBuilderResultSchema, provider: z.string().min(1) });
const errorSchema = z.strictObject({ error: z.string().min(1).max(500) });
type ProviderStatus = z.infer<typeof providerStatusSchema>;

const providerSetup: Record<AiProviderId, { keyUrl: string; variables: string; description: string; pricingUrl?: string }> = {
  mock: { keyUrl: '', variables: '', description: 'O modo local não gera planos personalizados.' },
  openrouter: { keyUrl: 'https://openrouter.ai/settings/keys', variables: 'OPENROUTER_API_KEY=sua_chave\nOPENROUTER_MODEL=openrouter/free', description: 'Somente modelos gratuitos são aceitos; disponibilidade e limites dependem do provedor.' },
  nvidia: { keyUrl: 'https://build.nvidia.com/settings/api-keys', variables: 'NVIDIA_API_KEY=sua_chave\nNVIDIA_MODEL=nvidia/nemotron-3-ultra-550b-a55b', description: 'Acesso de avaliação sujeito à disponibilidade do modelo e aos limites da conta NVIDIA.' },
  openai: { keyUrl: 'https://platform.openai.com/api-keys', pricingUrl: 'https://developers.openai.com/api/docs/pricing', variables: 'OPENAI_API_KEY=sua_chave\nOPENAI_MODEL=gpt-6-luna', description: 'A API é cobrada por uso; o nível gratuito não está disponível para esse modelo.' },
  azure: { keyUrl: 'https://portal.azure.com/', variables: 'AZURE_OPENAI_ENDPOINT=seu_endpoint\nAZURE_OPENAI_API_KEY=sua_chave\nAZURE_OPENAI_DEPLOYMENT=seu_deployment', description: 'O uso depende do deployment e da configuração Azure da sua organização.' },
};

const providerLabels: Record<AiProviderId, string> = {
  mock: 'Modo local (sem IA personalizada)',
  openrouter: 'OpenRouter · gratuito',
  nvidia: 'NVIDIA Build · avaliação',
  openai: 'OpenAI · GPT-6 Luna (padrão, pago)',
  azure: 'Azure OpenAI',
};

function formatIssue(issue: WorkflowPlanValidationIssue): string {
  return issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message;
}

function displaySchema(schema: WorkflowBuilderJsonSchema): string {
  return JSON.stringify(schema, null, 2);
}

function WorkflowPlanReview({ plan }: { plan: WorkflowPlan }) {
  return <div className="stack workflow-plan-review">
    <div className="panel stack">
      <h3>Gatilho</h3>
      <p><strong>{plan.trigger.name}</strong> · {plan.trigger.kind === 'Request' ? 'Requisição HTTP' : `Recorrência ${plan.trigger.frequency} · intervalo ${plan.trigger.interval}`}</p>
      {plan.trigger.kind === 'Request' && <div><h4>Contrato da requisição</h4><pre className="workflow-code-preview"><code>{displaySchema(plan.trigger.requestSchema)}</code></pre></div>}
    </div>
    {plan.actions.map((action) => <div className="panel stack" key={action.name}>
      <h3>{action.name} · {action.kind}</h3>
      {action.kind === 'Http' && <>
        <p><strong>Método:</strong> {action.method}</p>
        <p><strong>Endpoint:</strong> <code className="workflow-endpoint">{action.uri}</code></p>
        {action.responseSchema && <div><h4>Contrato da resposta</h4><pre className="workflow-code-preview"><code>{displaySchema(action.responseSchema)}</code></pre></div>}
        <p><strong>Autenticação:</strong> {action.authentication.kind === 'none' ? 'sem autenticação' : `placeholder de ${action.authentication.kind} no parâmetro seguro ${action.authentication.parameterName}`}</p>
      </>}
      {action.kind === 'Compose' && <p>Prepara um valor para as próximas etapas.</p>}
      {action.kind === 'Response' && <p><strong>Status HTTP:</strong> {action.statusCode}</p>}
    </div>)}
  </div>;
}

export function WorkflowBuilder({ onBack }: { onBack: () => void }) {
  const [catalog, setCatalog] = useState<z.infer<typeof providerCatalogSchema> | null>(null);
  const [catalogError, setCatalogError] = useState('');
  const [provider, setProvider] = useState<AiProviderId>('openrouter');
  const [message, setMessage] = useState('');
  const [context, setContext] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [contextPreview, setContextPreview] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState<WorkflowBuilderResult | null>(null);
  const [resultProvider, setResultProvider] = useState('');
  const [artifacts, setArtifacts] = useState<WorkflowBuilderArtifacts | null>(null);
  const [artifactName, setArtifactName] = useState('azuredeploy.json');
  const [confirmPlan, setConfirmPlan] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [blockingIssues, setBlockingIssues] = useState<WorkflowPlanValidationIssue[]>([]);

  useEffect(() => {
    let active = true;
    void fetch('/api/assistant', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Não foi possível consultar a configuração dos provedores.');
        const payload: unknown = await response.json();
        const parsed = providerCatalogSchema.safeParse(payload);
        if (!parsed.success) throw new Error('A lista de provedores retornou um formato inesperado.');
        if (active) setCatalog(parsed.data);
      })
      .catch(() => { if (active) setCatalogError('Não foi possível consultar os provedores. A proposta local continua disponível.'); });
    return () => { active = false; };
  }, []);

  const selectedStatus = useMemo<ProviderStatus | undefined>(() => catalog?.providers.find((item) => item.id === provider), [catalog, provider]);
  const selectedSetup = providerSetup[provider];
  const canUseProvider = selectedStatus?.configured === true && selectedStatus.mock === false;
  const selectedArtifact = artifacts ? artifacts[artifactName === 'azuredeploy.json' ? 'armTemplate' : artifactName === 'workflow.json' ? 'workflowDefinition' : 'readme'] : '';

  function invalidatePreview(): void {
    setPreview(null);
    setContextPreview(null);
    setConsent(false);
    setError('');
  }

  function preparePreview(): void {
    if (!message.trim()) {
      setError('Descreva o workflow antes de preparar a prévia.');
      return;
    }
    const sanitizedContext = redactContent(context).content;
    if (sanitizedContext.length > 100000 || new TextEncoder().encode(sanitizedContext).length > 300000) {
      setError('O contexto desta conversa excede o limite seguro para um envio. Volte às opções para iniciar uma nova conversa.');
      return;
    }
    setError('');
    setPreview(redactContent(message).content);
    setContextPreview(sanitizedContext);
    setConsent(false);
  }

  async function sendPreview(): Promise<void> {
    if (preview === null || contextPreview === null || !canUseProvider || !consent || isSending) return;
    const sentMessage = preview;
    const sentContext = contextPreview;
    setIsSending(true);
    setConsent(false);
    setError('');
    setBlockingIssues([]);
    try {
      const response = await fetch('/api/workflow-builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: sentMessage, context: sentContext, provider, consent: true }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const parsedError = errorSchema.safeParse(payload);
        throw new Error(parsedError.success ? parsedError.data.error : 'Não foi possível gerar uma proposta. Revise a configuração e tente novamente.');
      }
      const parsed = responseSchema.safeParse(payload);
      if (!parsed.success) throw new Error('A resposta não corresponde ao formato esperado para um plano de workflow.');
      const nextResult = parsed.data.result;
      if (nextResult.status === 'ready') {
        const validation = validateWorkflowPlan(nextResult.plan);
        if (!validation.valid) {
          setBlockingIssues(validation.issues);
          throw new Error('O plano contém problemas que impedem a geração do pacote.');
        }
        setConfirmPlan(false);
        setArtifacts(null);
      }
      setContext([sentContext, `Pedido revisado: ${sentMessage}`, `Resposta validada: ${JSON.stringify(nextResult)}`].filter(Boolean).join('\n\n'));
      setResult(nextResult);
      setResultProvider(parsed.data.provider);
      setMessage('');
      setPreview(null);
      setContextPreview(null);
      setConsent(false);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Não foi possível obter uma resposta segura.');
    } finally {
      setIsSending(false);
    }
  }

  function generatePackage(): void {
    if (result?.status !== 'ready' || !confirmPlan) return;
    setError('');
    setBlockingIssues([]);
    try {
      const generated = generateWorkflowArtifacts(result.plan);
      const validation = validateGeneratedWorkflow(generated);
      if (!validation.valid) {
        setBlockingIssues(validation.issues);
        setError('A validação local encontrou problemas. Corrija o plano antes de baixar os arquivos.');
        setArtifacts(null);
        return;
      }
      setArtifacts(generated);
      setArtifactName('azuredeploy.json');
    } catch (generationError) {
      if (generationError instanceof WorkflowGenerationError) setBlockingIssues(generationError.issues);
      setError('Não foi possível gerar um pacote válido. Revise os diagnósticos antes de continuar.');
      setArtifacts(null);
    }
  }

  function downloadHref(content: string): string {
    return `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`;
  }

  return <section className="stack" aria-labelledby="workflow-builder-title">
    <div className="flex-row"><button className="button-secondary" onClick={onBack}><ArrowLeft size={17} aria-hidden="true" /> Voltar às opções</button><span className="badge">Logic Apps Consumption</span></div>
    <div><p className="eyebrow">QUERO CRIAR</p><h1 id="workflow-builder-title">Construtor de workflow</h1><p className="muted">Descreva o resultado que você quer. A IA propõe um plano limitado a gatilhos Request/Recurrence e ações HTTP, Compose e Response.</p></div>

    <div className="notice notice-warning"><strong>Não informe senhas, tokens, chaves ou dados pessoais.</strong> Cada envio exige revisão da prévia sanitizada e autorização explícita. Nenhum recurso Azure será criado ou implantado.</div>

    <div className="panel stack workflow-builder-form">
      <div className="input-group">
        <label htmlFor="workflow-provider">Provedor de IA</label>
        <select id="workflow-provider" className="field" value={provider} onChange={(event) => { setProvider(event.target.value as AiProviderId); invalidatePreview(); setResult(null); setArtifacts(null); }}>
          {aiProviderIds.map((id) => <option value={id} key={id}>{providerLabels[id]}</option>)}
        </select>
      </div>

      {!catalog && !catalogError && <p className="muted" role="status">Consultando os provedores disponíveis…</p>}
      {catalogError && <p className="notice notice-error" role="alert">{catalogError}</p>}
      {provider === 'mock' && <p className="notice notice-warning" role="status">O modo local não gera planos personalizados. Escolha um provedor real configurado para continuar.</p>}
      {catalog && !catalog.providers.some((item) => item.configured && !item.mock) && provider !== 'mock' && <p className="notice notice-warning" role="status">Configure um provedor de IA para montar um workflow personalizado.</p>}
      {provider !== 'mock' && (!selectedStatus?.configured || !catalog) && <details className="notice" open>
        <summary>Como configurar {providerLabels[provider]}</summary>
        <div className="stack" style={{ gap: 9, marginTop: 12 }}>
          {selectedSetup.keyUrl && <a href={selectedSetup.keyUrl} target="_blank" rel="noreferrer">Criar chave no provedor</a>}
          {selectedSetup.pricingUrl && <a href={selectedSetup.pricingUrl} target="_blank" rel="noreferrer">Consultar preços da API</a>}
          <p>Guarde as configurações no ambiente do servidor e reinicie a aplicação:</p>
          <pre className="workflow-code-preview"><code>{selectedSetup.variables}</code></pre>
          <p>{selectedSetup.description}</p>
        </div>
      </details>}

      <div className="input-group">
        <label htmlFor="workflow-message">Descreva o workflow em linguagem natural</label>
        <p className="muted small" id="workflow-message-hint">Ex.: quando chegar um pedido, envie o identificador para uma API e devolva o número da fatura.</p>
        <textarea id="workflow-message" className="textarea" maxLength={6000} aria-describedby="workflow-message-hint" value={message} onChange={(event) => { setMessage(event.target.value); invalidatePreview(); setResult(null); setArtifacts(null); }} placeholder="Descreva o gatilho, as etapas e o resultado esperado." />
      </div>
      {result?.status === 'needs-input' && <div className="notice" role="status"><strong>{result.summary}</strong><ul>{result.questions.map((question) => <li key={question}>{question}</li>)}</ul><p>Responda às perguntas na descrição acima e prepare uma nova prévia.</p></div>}
      <div className="form-actions">
        <button className="button" onClick={preparePreview} disabled={!message.trim() || isSending}>Preparar prévia</button>
      </div>

      {preview !== null && <div className="panel stack workflow-preview" aria-label="Prévia e autorização">
        <h2>Revise o conteúdo deste envio</h2>
        <div className="input-group">
          <label htmlFor="workflow-preview">Prévia sanitizada para revisão</label>
          <textarea id="workflow-preview" className="textarea" maxLength={6000} value={preview} onChange={(event) => { setPreview(event.target.value); setConsent(false); }} />
        </div>
        {contextPreview !== null && contextPreview.length > 0 && <div className="input-group">
          <label htmlFor="workflow-context-preview">Prévia do contexto anterior que será enviado</label>
          <textarea id="workflow-context-preview" className="textarea workflow-context-preview" maxLength={100000} value={contextPreview} onChange={(event) => { setContextPreview(event.target.value); setConsent(false); }} />
        </div>}
        {canUseProvider && <label className="checkbox-row" htmlFor="workflow-consent"><input id="workflow-consent" type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />Autorizo o envio da prévia sanitizada e do contexto exibido ao provedor selecionado</label>}
        {!canUseProvider && <p className="muted">O envio está bloqueado até selecionar um provedor real configurado.</p>}
        <div className="notice"><strong>Destino:</strong> {selectedStatus?.provider ?? providerLabels[provider]}. Confira novamente o conteúdo e o destino antes de enviar.</div>
        <button className="button" onClick={() => void sendPreview()} disabled={!canUseProvider || !consent || isSending}>{isSending ? 'Aguardando resposta…' : 'Enviar prévia revisada'}</button>
      </div>}
    </div>

    {error && <div className="notice notice-error" role="alert">{error}{blockingIssues.length > 0 && <ul>{blockingIssues.map((issue, index) => <li key={`${issue.code}-${index}`}>{formatIssue(issue)}</li>)}</ul>}</div>}

    {result?.status === 'ready' && <section className="stack" aria-labelledby="workflow-plan-title">
      <div className="notice" role="status"><ShieldCheck size={17} aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: 6 }} />Proposta validada. Resposta recebida de {resultProvider}; revise todos os detalhes antes de gerar os arquivos.</div>
      <div className="panel stack">
        <div><p className="eyebrow">PLANO PROPOSTO</p><h2 id="workflow-plan-title">Revise o plano proposto</h2><p>{result.summary}</p></div>
        {result.assumptions.length > 0 && <div><h3>Premissas</h3><ul>{result.assumptions.map((item) => <li key={item}>{item}</li>)}</ul></div>}
        {result.warnings.length > 0 && <div className="notice notice-warning"><strong>Antes de importar</strong><ul>{result.warnings.map((item) => <li key={item}>{item}</li>)}</ul></div>}
        <WorkflowPlanReview plan={result.plan} />
        <label className="checkbox-row" htmlFor="workflow-plan-confirm"><input id="workflow-plan-confirm" type="checkbox" checked={confirmPlan} onChange={(event) => { setConfirmPlan(event.target.checked); setArtifacts(null); }} />Revisei triggers, endpoint, método, contrato e autenticação do plano</label>
        <button className="button" onClick={generatePackage} disabled={!confirmPlan}>Gerar pacote para Logic Apps</button>
      </div>
    </section>}

    {artifacts && <section className="stack" aria-labelledby="workflow-artifacts-title">
      <div className="panel stack">
        <div><p className="eyebrow">VALIDADO LOCALMENTE</p><h2 id="workflow-artifacts-title">Prévia do pacote gerado</h2></div>
        <p className="notice"><ShieldCheck size={17} aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: 6 }} />Validação local concluída. Revise os arquivos e importe manualmente no Azure.</p>
        <div className="input-group"><label htmlFor="workflow-artifact-select">Arquivo para prévia</label><select id="workflow-artifact-select" className="field" value={artifactName} onChange={(event) => setArtifactName(event.target.value)}><option value="azuredeploy.json">azuredeploy.json · template ARM</option><option value="workflow.json">workflow.json · definição</option><option value="README.md">README.md · orientações</option></select></div>
        <pre className="workflow-code-preview" data-testid="artifact-preview"><code>{selectedArtifact}</code></pre>
        <div className="flex-row workflow-downloads">
          <a className="button-secondary" href={downloadHref(artifacts.workflowDefinition)} download="workflow.json"><Download size={16} aria-hidden="true" />Baixar workflow.json</a>
          <a className="button-secondary" href={downloadHref(artifacts.armTemplate)} download="azuredeploy.json"><Download size={16} aria-hidden="true" />Baixar azuredeploy.json</a>
          <a className="button-secondary" href={downloadHref(artifacts.readme)} download="README.md"><Download size={16} aria-hidden="true" />Baixar README.md</a>
        </div>
      </div>
    </section>}
  </section>;
}
