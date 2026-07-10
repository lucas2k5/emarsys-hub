import type { FieldMapping } from '@/types/api'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ envId: string }> }
) {
  const { envId } = await params
  const body = await request.json() as { mappings: FieldMapping[] }
  console.log(`[mock] PUT field-mappings for env ${envId}:`, body.mappings)
  return Response.json({ mappings: body.mappings })
}
