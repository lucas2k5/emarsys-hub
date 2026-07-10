/**
 * Worker da fila de contatos de um environment (flow "contacts" no scheduler).
 *
 * Processa em lotes os contatos elegíveis (pending/failed com next_attempt_at
 * vencido), aplicando os use cases de dedupe. Falha → backoff exponencial;
 * tentativas esgotadas → dead-letter (status 'dead').
 *
 * Modo debug (settings.debug = true): consome a fila SEM chamar a Emarsys —
 * marca como sent para validar o encanamento webhook → fila → worker.
 */

import { loadEnvironmentContext, markFlowRun } from '../../tenancy/context.js';
import { startRun, completeRun, failRun, hasRunningRun, type RunTrigger } from '../runs.js';
import { buildContactsGateway, type EmarsysContactsGateway } from './gateway.js';
import { syncContact } from './usecases.js';
import { claimBatch, markSent, markFailed, releaseStuckProcessing, type ContactRow } from './repo.js';
import { toContactData, type ContactsFlowSettings } from './types.js';

const DELAY_BETWEEN_ITEMS_MS = 1000;

export type ContactsSyncResult = {
  success: boolean;
  runId: string;
  processed?: number;
  sent?: number;
  failed?: number;
  dead?: number;
  debug?: boolean;
  error?: string;
};

export async function runContactsSync(
  environmentId: string,
  trigger: RunTrigger,
): Promise<ContactsSyncResult> {
  const ctx = await loadEnvironmentContext(environmentId);
  if (!ctx) throw new Error(`Environment ${environmentId} não encontrado`);

  if (await hasRunningRun(environmentId, 'contacts')) {
    throw new Error('Já existe um processamento de contatos em andamento para este environment');
  }

  const runId = await startRun(environmentId, 'contacts', trigger);
  const settings = (ctx.flows.contacts?.settings ?? {}) as ContactsFlowSettings;
  const debug = settings.debug === true;
  const maxAttempts = settings.maxAttempts ?? 5;
  const backoffBaseSeconds = settings.backoffBaseSeconds ?? 60;
  const batchSize = settings.batchSize ?? 50;
  const tag = `${ctx.tenantSlug}/${ctx.envSlug}`;

  let processed = 0;
  let sent = 0;
  let failed = 0;
  let dead = 0;

  try {
    // Itens presos em 'processing' por restart voltam pra fila
    await releaseStuckProcessing();

    let gateway: EmarsysContactsGateway | null = null;
    if (!debug) {
      gateway = await buildContactsGateway(ctx);
    }

    // Consome até esvaziar a fila elegível (novos lotes a cada iteração)
    for (;;) {
      const batch: ContactRow[] = await claimBatch(environmentId, batchSize);
      if (batch.length === 0) break;

      for (const row of batch) {
        processed++;
        try {
          const contact = toContactData(row.payload, false);
          if (debug) {
            console.log(`🧪 [contacts][${tag}] DEBUG — envio pulado para contato #${row.id} (${row.email ?? row.cpf})`);
          } else {
            const result = await syncContact(gateway!, contact);
            console.log(`✅ [contacts][${tag}] #${row.id}: ${result.message}`);
          }
          await markSent(row.id);
          sent++;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const status = await markFailed(row.id, message, { maxAttempts, backoffBaseSeconds });
          if (status === 'dead') {
            dead++;
            console.error(`💀 [contacts][${tag}] #${row.id} esgotou ${maxAttempts} tentativas → dead-letter: ${message}`);
          } else {
            failed++;
            console.warn(`⚠️ [contacts][${tag}] #${row.id} falhou (tentativa ${row.attempts + 1}/${maxAttempts}): ${message}`);
          }
        }
        await new Promise((r) => setTimeout(r, DELAY_BETWEEN_ITEMS_MS));
      }
    }

    const stats = { processed, sent, failed, dead, debug };
    await completeRun(runId, stats);
    await markFlowRun(environmentId, 'contacts', 'success');
    if (processed > 0) console.log(`🎉 [contacts][${tag}] Fila processada`, stats);
    return { success: true, runId, ...stats };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await failRun(runId, message, { processed, sent, failed, dead });
    await markFlowRun(environmentId, 'contacts', 'error');
    console.error(`❌ [contacts][${tag}] Worker falhou: ${message}`);
    return { success: false, runId, error: message };
  }
}
