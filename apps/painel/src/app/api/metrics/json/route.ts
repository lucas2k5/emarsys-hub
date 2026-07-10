export async function GET() {
  return Response.json({
    uptime: 432000,
    memory: { used: 284, total: 512, percent: 55 },
    requests: { total: 142837, errors: 312, rate: 4.7 },
  })
}
