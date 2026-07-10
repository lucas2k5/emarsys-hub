import type { Environment } from '@/types/api'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const body = await request.json() as { slug: string; name: string }
  const newEnv: Environment = {
    id: `env-${Date.now()}`,
    slug: body.slug,
    name: body.name,
    status: 'active',
  }
  console.log(`[mock] Created environment for tenant ${slug}:`, newEnv)
  return Response.json({ environment: newEnv }, { status: 201 })
}
