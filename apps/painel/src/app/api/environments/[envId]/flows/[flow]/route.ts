export async function PUT(
  request: Request,
  { params }: { params: Promise<{ envId: string; flow: string }> }
) {
  const { envId, flow } = await params
  const body = await request.json() as { enabled: boolean; cronExpression?: string | null; settings?: Record<string, unknown> }
  console.log(`[mock] PUT flow ${flow} for env ${envId}:`, body)
  return Response.json({
    flow: {
      flow,
      enabled: body.enabled,
      cronExpression: body.cronExpression ?? null,
      settings: body.settings ?? {},
    },
  })
}
