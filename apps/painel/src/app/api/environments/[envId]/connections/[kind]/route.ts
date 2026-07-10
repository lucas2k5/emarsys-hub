export async function PUT(
  request: Request,
  { params }: { params: Promise<{ envId: string; kind: string }> }
) {
  const { envId, kind } = await params
  const body = await request.json() as { config: Record<string, string>; secrets?: Record<string, string> }
  console.log(`[mock] PUT connection ${kind} for env ${envId}:`, { config: body.config })
  return Response.json({
    connection: { kind, config: body.config, hasSecrets: !!(body.secrets && Object.keys(body.secrets).some(k => body.secrets![k])) },
  })
}
