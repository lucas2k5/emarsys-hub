// Mock do dashboard de wishlist (modo dev sem API)
export async function GET() {
  return Response.json({
    environments: [
      { environmentId: 'env-1', envSlug: 'principal', envName: 'Principal', tenantSlug: 'mock', enabled: true, cronExpression: '0 */2 * * *', checkpoint: '2026-06-29T04:10:00.000Z', lastRunAt: '2026-06-29T06:00:00.000Z', lastStatus: 'success' },
      { environmentId: 'env-2', envSlug: 'outlet', envName: 'Outlet', tenantSlug: 'mock', enabled: false, cronExpression: null, checkpoint: null, lastRunAt: null, lastStatus: null },
    ],
    runs: [
      { id: 'r1', envSlug: 'principal', status: 'completed', trigger: 'cron', progress: 100, stats: { collected: 182, sent: 180, errors: 2, checkpoint: '2026-06-29T04:10:00.000Z' }, error: null, startedAt: '2026-06-29T06:00:00.000Z', finishedAt: '2026-06-29T06:04:12.000Z' },
      { id: 'r2', envSlug: 'principal', status: 'completed', trigger: 'cron', progress: 100, stats: { collected: 95, sent: 95, errors: 0 }, error: null, startedAt: '2026-06-29T04:00:00.000Z', finishedAt: '2026-06-29T04:02:40.000Z' },
      { id: 'r3', envSlug: 'principal', status: 'failed', trigger: 'manual', progress: 35, stats: {}, error: 'Emarsys wishlist/update falhou: [429] Too Many Requests', startedAt: '2026-06-28T22:00:00.000Z', finishedAt: '2026-06-28T22:01:10.000Z' },
    ],
  })
}
