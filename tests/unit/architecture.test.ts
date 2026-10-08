import { describe, expect, it } from 'vitest';
import { buildArchitectureProposal, type ArchitectureAnswers } from '@/lib/architecture';

const complete: ArchitectureAnswers = {
  event: 'Pedido recebido', entry: 'queue', volume: 'high', immediateResponse: 'no',
  asynchronous: 'yes', privateNetwork: 'yes', stateful: 'yes', localDevelopment: 'yes',
  onPremises: 'no', systems: 'Service Bus e API de pedidos', ordered: 'yes', duplicates: 'yes', outage: 'queue',
};

describe('architecture proposals', () => {
  it('qualifies Standard for private networking and local development with complete answers', () => {
    const result = buildArchitectureProposal(complete);
    expect(result.hosting.option).toBe('Standard');
    expect(result.hosting.reason).toMatch(/rede privada/);
    expect(result.trigger).toMatch(/fila/);
    expect(result.idempotency).toMatch(/persistente/);
    expect(result.ordering).toMatch(/sessões/);
    expect(result.checklist.length).toBeGreaterThan(5);
    expect(result.conceptualSkeleton).toMatch(/Catch/);
  });
  it('does not select hosting without enough information and lists useful questions', () => {
    const result = buildArchitectureProposal({});
    expect(result.hosting.option).toBe('Undetermined');
    expect(result.unknowns).toContain('Qual é o volume aproximado?');
    expect(result.unknowns.length).toBe(13);
    expect(result.summary).toMatch(/não informado/);
  });
  it('considers Consumption only when hosting requirements are explicit', () => {
    const result = buildArchitectureProposal({ ...complete, privateNetwork: 'no', localDevelopment: 'no', volume: 'low' });
    expect(result.hosting.option).toBe('Consumption');
    expect(result.hosting.reason).toMatch(/validar/);
  });
  it('flags incompatible synchronous response and queue without hiding the tradeoff', () => {
    const result = buildArchitectureProposal({ ...complete, immediateResponse: 'yes', asynchronous: 'no' });
    expect(result.unknowns.join(' ')).toMatch(/resposta imediata/);
  });
  it('does not mutate answers and defers exact prices', () => {
    const input = { ...complete };
    const before = JSON.stringify(input);
    expect(buildArchitectureProposal(input).costFactors).toMatch(/calculadora oficial/);
    expect(JSON.stringify(input)).toBe(before);
  });
  it('explains durable state requirements instead of treating hosting and execution mode as equivalent', () => {
    expect(buildArchitectureProposal(complete).workflowMode).toMatch(/Stateful/);
    expect(buildArchitectureProposal({ ...complete, stateful: 'no', outage: 'fail' }).workflowMode).toMatch(/Stateless/);
    expect(buildArchitectureProposal({}).workflowMode).toMatch(/confirmar/);
  });
});
