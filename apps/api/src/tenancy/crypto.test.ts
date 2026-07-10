import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(() => {
  // Chave de teste (32 bytes em hex) — só para a suite
  process.env.ENCRYPTION_KEY = 'a'.repeat(64);
});

describe('crypto de secrets (AES-256-GCM)', () => {
  it('roundtrip encrypt → decrypt preserva o objeto', async () => {
    const { encryptSecrets, decryptSecrets } = await import('./crypto.js');
    const original = { appToken: 'tok-123', password: 'çãé-ü€' };
    const encrypted = encryptSecrets(original);
    expect(encrypted).toMatch(/^v1:k1:/);
    expect(decryptSecrets(encrypted)).toEqual(original);
  });

  it('cada encrypt gera ciphertext diferente (IV aleatório)', async () => {
    const { encryptSecrets } = await import('./crypto.js');
    expect(encryptSecrets({ a: 1 })).not.toEqual(encryptSecrets({ a: 1 }));
  });

  it('ciphertext adulterado é rejeitado sem vazar detalhe', async () => {
    const { encryptSecrets, decryptSecrets } = await import('./crypto.js');
    const encrypted = encryptSecrets({ secreto: 'x' });
    const parts = encrypted.split(':');
    // corrompe o corpo do cipher
    parts[3] = Buffer.from('corrompido!!').toString('base64');
    expect(() => decryptSecrets(parts.join(':'))).toThrow(/inválido ou corrompido/);
  });

  it('formato desconhecido é rejeitado', async () => {
    const { decryptSecrets } = await import('./crypto.js');
    expect(() => decryptSecrets('lixo')).toThrow(/Formato/);
    expect(() => decryptSecrets('v9:k1:a:b:c')).toThrow(/Versão/);
  });
});
