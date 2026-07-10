export async function GET() {
  return Response.json({
    total: 8412,
    pending: 123,
    sent: 8100,
    failed: 156,
    dead: 33,
    byClientType: [
      { client_type: 'hope',   status: 'sent',    count: 4820 },
      { client_type: 'hope',   status: 'pending', count: 71 },
      { client_type: 'hope',   status: 'failed',  count: 89 },
      { client_type: 'hope',   status: 'dead',    count: 18 },
      { client_type: 'resort', status: 'sent',    count: 3280 },
      { client_type: 'resort', status: 'pending', count: 52 },
      { client_type: 'resort', status: 'failed',  count: 67 },
      { client_type: 'resort', status: 'dead',    count: 15 },
    ],
  })
}
