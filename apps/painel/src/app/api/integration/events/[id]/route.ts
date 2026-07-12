// Mock do detalhe de evento (modo dev sem API)
export async function GET(_req: Request, ctx: { params: Promise<unknown> }) {
  const { id } = (await ctx.params) as { id: string }
  return Response.json({
    event: {
      id: Number(id), flow: 'contacts', direction: 'outbound', level: 'info', event: 'contact_update',
      subject: 'ana.silva@email.com', statusCode: 200, durationMs: 312,
      createdAt: '2026-06-29T08:00:00.000Z', envSlug: 'principal', runId: null,
      requestPayload: { key_id: '9001', contacts: [{ '9001': 'a1b2c3…hash…', '3': 'ana.silva@email.com', '9002': '***.***.789-01' }] },
      responsePayload: { replyCode: 0, replyText: 'OK', data: { ids: [12345] } },
    },
  })
}
