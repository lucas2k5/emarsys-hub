export async function GET() {
  return Response.json({
    jobs: [
      { name: 'sync-orders', running: false, lastRun: '2026-06-29T08:45:00.000Z', nextRun: '2026-06-29T09:15:00.000Z', schedule: '*/30 * * * *' },
      { name: 'sync-contacts', running: true,  lastRun: '2026-06-29T09:00:00.000Z', nextRun: '2026-06-29T09:30:00.000Z', schedule: '*/30 * * * *' },
      { name: 'export-products', running: false, lastRun: '2026-06-29T06:00:00.000Z', nextRun: '2026-06-30T06:00:00.000Z', schedule: '0 6 * * *' },
      { name: 'retry-failed-contacts', running: false, lastRun: '2026-06-29T08:00:00.000Z', nextRun: '2026-06-29T10:00:00.000Z', schedule: '0 */2 * * *' },
    ],
  })
}
