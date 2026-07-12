import { describe, it, expect } from 'vitest';
import { sanitizePayload } from './audit.js';

describe('sanitizePayload — privacidade da trilha de auditoria', () => {
  it('mascara CPF em strings (com e sem pontuação)', () => {
    expect(sanitizePayload('doc 390.533.447-05 ok')).toBe('doc ***.***.447-05 ok');
    expect(sanitizePayload('39053344705')).toBe('***.***.447-05');
  });

  it('PRESERVA hash sha256 íntegro (customer_id)', () => {
    const hash = 'a'.repeat(30) + '12345678901' + 'b'.repeat(23); // 64 chars com 11 dígitos no meio
    expect(hash).toHaveLength(64);
    expect(sanitizePayload(hash)).toBe(hash);
  });

  it('mascara campos cpf/document e remove chaves sensíveis', () => {
    const out = sanitizePayload({
      cpf: '39053344705',
      document: '111.444.777-35',
      customer_id: 'f'.repeat(64),
      authorization: 'Bearer super-secreto',
      appToken: 'tok-vtex',
      email: 'a@b.com',
    }) as Record<string, unknown>;

    expect(out.cpf).toBe('***.***.447-05');
    expect(out.document).toBe('***.***.777-35');
    expect(out.customer_id).toBe('f'.repeat(64));
    expect(out.authorization).toBe('[removido]');
    expect(out.appToken).toBe('[removido]');
    expect(out.email).toBe('a@b.com');
  });

  it('sanitiza estruturas aninhadas e trunca arrays gigantes', () => {
    const out = sanitizePayload({
      contacts: [{ '4884': '390.533.447-05', nested: { doc: 'cpf 11144477735' } }],
      lista: Array.from({ length: 60 }, (_, i) => i),
    }) as { contacts: Array<Record<string, unknown>>; lista: unknown[] };

    expect(out.contacts[0]['4884']).toBe('***.***.447-05');
    expect((out.contacts[0].nested as Record<string, string>).doc).toBe('cpf ***.***.777-35');
    expect(out.lista).toHaveLength(51); // 50 itens + marcador de truncamento
    expect(out.lista[50]).toContain('+10 itens');
  });
});
