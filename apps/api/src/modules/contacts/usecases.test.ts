import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncContactWithCpf, syncContactWithoutCpf } from './usecases.js';
import type { EmarsysContactsGateway, ExistingContact } from './gateway.js';
import type { ContactData } from './types.js';

/**
 * Gateway fake — permite verificar a árvore de decisão do dedupe
 * (transplantada do conector de origem) sem nenhuma chamada externa.
 */
function fakeGateway(state: {
  emailMatches?: ExistingContact[];
  cpfOwnerId?: string | null;
}) {
  const matches = state.emailMatches ?? [];
  return {
    countEmail: vi.fn(async () => matches.length),
    getContactsDetailsByEmail: vi.fn(async () => matches),
    getContactIdByCpf: vi.fn(async () => state.cpfOwnerId ?? null),
    cpfExists: vi.fn(async () => (state.cpfOwnerId ?? null) !== null),
    createContact: vi.fn(async () => {}),
    updateContact: vi.fn(async () => {}),
    deleteContact: vi.fn(async () => {}),
  } as unknown as EmarsysContactsGateway & {
    createContact: ReturnType<typeof vi.fn>;
    updateContact: ReturnType<typeof vi.fn>;
    deleteContact: ReturnType<typeof vi.fn>;
  };
}

function contact(overrides: Partial<ContactData> = {}): ContactData {
  return {
    id: 'CUST-1',
    email: 'a@b.com',
    cpf: '39053344705',
    fanOut: false,
    ...overrides,
  } as ContactData;
}

describe('syncContactWithCpf — árvore de dedupe', () => {
  it('email inédito + CPF inédito → cria cliente', async () => {
    const gw = fakeGateway({ emailMatches: [], cpfOwnerId: null });
    const out = await syncContactWithCpf(gw, contact());
    expect(out.action).toBe('created');
    expect(gw.createContact).toHaveBeenCalledOnce();
  });

  it('email inédito mas CPF existente → atualiza pelo id do dono do CPF', async () => {
    const gw = fakeGateway({ emailMatches: [], cpfOwnerId: 'id-77' });
    const out = await syncContactWithCpf(gw, contact());
    expect(out.action).toBe('updated');
    expect(gw.updateContact).toHaveBeenCalledWith(expect.anything(), 'id-77');
  });

  it('1 lead com o email (sem CPF em lugar nenhum) → converte o lead', async () => {
    const gw = fakeGateway({
      emailMatches: [{ id: 'lead-1', email: 'a@b.com', cpf: null, isLead: true }],
      cpfOwnerId: null,
    });
    const out = await syncContactWithCpf(gw, contact());
    expect(out.message).toContain('Converte o Lead');
    expect(gw.updateContact).toHaveBeenCalledWith(expect.anything(), 'lead-1');
    expect(gw.deleteContact).not.toHaveBeenCalled();
  });

  it('lead com o email E outro contato dono do CPF → atualiza o dono e apaga o lead', async () => {
    const gw = fakeGateway({
      emailMatches: [{ id: 'lead-1', email: 'a@b.com', cpf: null, isLead: true }],
      cpfOwnerId: 'cliente-9',
    });
    const out = await syncContactWithCpf(gw, contact());
    expect(gw.updateContact).toHaveBeenCalledWith(expect.anything(), 'cliente-9');
    expect(gw.deleteContact).toHaveBeenCalledWith('lead-1');
    expect(out.message).toContain('Apaga o Lead');
  });

  it('múltiplos emails com um deles do mesmo CPF → atualiza e apaga os leads', async () => {
    const gw = fakeGateway({
      emailMatches: [
        { id: 'c-1', email: 'a@b.com', cpf: '39053344705', isLead: false },
        { id: 'lead-2', email: 'a@b.com', cpf: null, isLead: true },
      ],
      cpfOwnerId: 'c-1',
    });
    const out = await syncContactWithCpf(gw, contact());
    expect(gw.updateContact).toHaveBeenCalledWith(expect.anything(), 'c-1');
    expect(gw.deleteContact).toHaveBeenCalledWith('lead-2');
    expect(out.action).toBe('updated');
  });
});

describe('syncContactWithoutCpf', () => {
  it('email inédito → cria lead', async () => {
    const gw = fakeGateway({ emailMatches: [] });
    const out = await syncContactWithoutCpf(gw, contact({ cpf: null }));
    expect(out.message).toContain('Lead criado');
    expect(gw.createContact).toHaveBeenCalledOnce();
  });

  it('registro existente COM CPF → preserva o CPF existente no update', async () => {
    const gw = fakeGateway({
      emailMatches: [{ id: 'c-1', email: 'a@b.com', cpf: '11144477735', isLead: false }],
    });
    await syncContactWithoutCpf(gw, contact({ cpf: null }));
    const sent = gw.updateContact.mock.calls[0][0] as ContactData;
    expect(sent.cpf).toBe('11144477735'); // CPF preservado, não sobrescrito com null
  });

  it('múltiplos registros → prioriza o que tem CPF e remove duplicados', async () => {
    const gw = fakeGateway({
      emailMatches: [
        { id: 'lead-1', email: 'a@b.com', cpf: null, isLead: true },
        { id: 'c-2', email: 'a@b.com', cpf: '11144477735', isLead: false },
      ],
    });
    await syncContactWithoutCpf(gw, contact({ cpf: null }));
    expect(gw.updateContact).toHaveBeenCalledWith(expect.anything(), 'c-2');
    expect(gw.deleteContact).toHaveBeenCalledWith('lead-1');
  });
});
