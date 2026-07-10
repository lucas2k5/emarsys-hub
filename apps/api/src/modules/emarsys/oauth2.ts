/**
 * OAuth2 client_credentials da Emarsys com cache de token POR ENVIRONMENT.
 *
 * Nos conectores originais o token era um singleton — contas diferentes
 * colidiam no mesmo cache. Aqui a chave do cache é o environment_id.
 */

import axios from 'axios';

export type OAuth2Config = {
  clientId: string;
  clientSecret: string;
  tokenEndpoint: string;
};

type CachedToken = {
  accessToken: string;
  expiresAt: number;
};

const EXPIRY_MARGIN_MS = 60_000;

const tokenCache = new Map<string, CachedToken>();

// Requests de token em andamento por environment — evita que duas execuções
// concorrentes (cron + manual) peçam token duplicado ao mesmo tempo.
const pendingRequests = new Map<string, Promise<string>>();

function isValid(cached: CachedToken | undefined): cached is CachedToken {
  return !!cached && Date.now() < cached.expiresAt - EXPIRY_MARGIN_MS;
}

export function isOAuth2Configured(cfg: Partial<OAuth2Config>): cfg is OAuth2Config {
  return !!(cfg.clientId && cfg.clientSecret && cfg.tokenEndpoint);
}

export async function getAccessToken(environmentId: string, cfg: OAuth2Config): Promise<string> {
  const cached = tokenCache.get(environmentId);
  if (isValid(cached)) return cached.accessToken;

  let pending = pendingRequests.get(environmentId);
  if (!pending) {
    pending = requestNewToken(environmentId, cfg).finally(() => {
      pendingRequests.delete(environmentId);
    });
    pendingRequests.set(environmentId, pending);
  }
  return pending;
}

async function requestNewToken(environmentId: string, cfg: OAuth2Config): Promise<string> {
  const response = await axios.post(
    cfg.tokenEndpoint,
    new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      auth: { username: cfg.clientId, password: cfg.clientSecret },
      timeout: 15_000,
    },
  );

  const { access_token, expires_in } = response.data as { access_token?: string; expires_in?: number };
  if (!access_token) {
    tokenCache.delete(environmentId);
    throw new Error('Resposta do token endpoint não contém access_token');
  }

  tokenCache.set(environmentId, {
    accessToken: access_token,
    expiresAt: Date.now() + (expires_in ?? 3600) * 1000,
  });

  return access_token;
}

/** Invalida o token do environment (força renovação na próxima chamada). */
export function invalidateToken(environmentId: string): void {
  tokenCache.delete(environmentId);
}
