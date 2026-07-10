/**
 * Criptografia de secrets de conexão usando AES-256-GCM.
 *
 * Formato do ciphertext: v1:<key_id>:<iv_b64>:<cipher_b64>:<tag_b64>
 * - v1        : versão do esquema (permite rotação futura sem quebrar dados antigos)
 * - key_id    : identificador da chave (fixo "k1" enquanto houver só uma chave)
 * - iv_b64    : IV aleatório de 12 bytes em base64 (único por operação)
 * - cipher_b64: ciphertext em base64
 * - tag_b64   : auth tag GCM de 16 bytes em base64
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const CURRENT_KEY_ID = 'k1';

// Memoização da chave derivada — lida do env uma vez e validada; Buffer
// imutável reutilizado em todos os encrypt/decrypt da instância.
let _cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (_cachedKey) return _cachedKey;

  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) throw new Error('ENCRYPTION_KEY não definida');
  const buf = Buffer.from(hex, 'hex');
  if (buf.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY deve ter 32 bytes (64 hex chars); recebido ${buf.length} bytes`,
    );
  }
  _cachedKey = buf;
  return buf;
}

/**
 * Criptografa um objeto qualquer (JSON-serializável) e retorna a string
 * no formato v1:<key_id>:<iv_b64>:<cipher_b64>:<tag_b64>.
 */
export function encryptSecrets(obj: unknown): string {
  const key = getKey();
  const iv = randomBytes(12);
  const plaintext = Buffer.from(JSON.stringify(obj), 'utf8');

  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    'v1',
    CURRENT_KEY_ID,
    iv.toString('base64'),
    ciphertext.toString('base64'),
    tag.toString('base64'),
  ].join(':');
}

/**
 * Descriptografa uma string no formato v1:... e retorna o objeto original.
 *
 * SEGURANÇA: erros internos de decrypt (falha de autenticação GCM, JSON inválido etc.)
 * são logados internamente mas NUNCA propagados ao chamador com detalhes —
 * evitar oráculo de padding/autenticação que poderia ajudar ataques.
 */
export function decryptSecrets(encrypted: string): unknown {
  const parts = encrypted.split(':');
  if (parts.length !== 5) {
    throw new Error('Formato de secrets inválido');
  }

  const [version, keyId, ivB64, cipherB64, tagB64] = parts;

  if (version !== 'v1') {
    throw new Error('Versão de criptografia não suportada');
  }

  // Por ora só existe k1; pronto para expansão quando houver rotação de chaves.
  if (keyId !== CURRENT_KEY_ID) {
    throw new Error('Chave de criptografia desconhecida');
  }

  const key = getKey();

  try {
    const iv = Buffer.from(ivB64, 'base64');
    const ciphertext = Buffer.from(cipherB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');

    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);

    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(plaintext.toString('utf8')) as unknown;
  } catch (err) {
    // Log interno com detalhe técnico; mensagem genérica para o chamador.
    console.error('❌ [crypto] Falha ao descriptografar secrets:', (err as Error).message);
    throw new Error('Falha ao descriptografar secrets: dado inválido ou corrompido');
  }
}
