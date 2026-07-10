export async function GET() {
  return Response.json({
    ok: true,
    uptime: 432000,
    memory: { used: 284, total: 512, percent: 55 },
    timestamp: new Date().toISOString(),
  })
}
