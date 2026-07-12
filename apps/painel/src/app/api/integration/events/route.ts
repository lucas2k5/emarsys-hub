// Mock da trilha de auditoria (modo dev sem API)
const EVENTS = [
  { id: 3, flow: 'contacts', direction: 'outbound', level: 'info', event: 'contact_update', subject: 'ana.silva@email.com', statusCode: 200, durationMs: 312, createdAt: '2026-06-29T08:00:00.000Z', envSlug: 'principal' },
  { id: 2, flow: 'orders', direction: 'outbound', level: 'error', event: 'sales_csv_failed', subject: '128 pedidos', statusCode: 429, durationMs: 1840, createdAt: '2026-06-29T07:30:00.000Z', envSlug: 'principal' },
  { id: 1, flow: 'contacts', direction: 'inbound', level: 'info', event: 'webhook_received', subject: 'carlos.m@email.com', statusCode: null, durationMs: null, createdAt: '2026-06-29T07:00:00.000Z', envSlug: 'outlet' },
]
export async function GET() {
  return Response.json({ events: EVENTS, total: EVENTS.length })
}
