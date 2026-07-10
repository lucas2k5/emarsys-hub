export async function GET() {
  // Envelopado em { errors } para casar com o shape que useErrorLogs espera
  return Response.json({
    errors: [
      { orderId: 'RES-2026-00389', message: 'Emarsys HAPI: sales event rejected — invalid item price (0)', timestamp: '2026-06-28T19:10:00.000Z' },
      { orderId: 'HOP-2026-00799', message: 'Emarsys HAPI: rate limit exceeded (429) — retrying in 60s', timestamp: '2026-06-28T15:30:22.000Z' },
      { orderId: 'RES-2026-00355', message: 'SFTP upload failed: connection timeout after 30s', timestamp: '2026-06-28T06:05:11.000Z' },
      { orderId: 'HOP-2026-00720', message: 'Contact external_id not found in Emarsys: CUST-64910', timestamp: '2026-06-27T22:18:44.000Z' },
      { orderId: 'RES-2026-00301', message: 'Order sync skipped: order_status=canceled', timestamp: '2026-06-27T14:00:00.000Z' },
    ],
  })
}
