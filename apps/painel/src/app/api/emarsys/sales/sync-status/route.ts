export async function GET() {
  return Response.json({
    total: 15234,
    pending: 847,
    synced: 14387,
    lastSync: '2026-06-29T08:45:00.000Z',
    percentSynced: 94.4,
  })
}
