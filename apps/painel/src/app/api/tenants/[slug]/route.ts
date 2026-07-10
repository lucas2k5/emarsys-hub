import type { TenantDetail, Environment } from '@/types/api'
import { MOCK_TENANTS } from '../route'

const MOCK_ENVIRONMENTS: Record<string, Environment[]> = {
  altenburg: [
    { id: 'env-1', slug: 'producao', name: 'Produção', status: 'active' },
    { id: 'env-2', slug: 'staging', name: 'Staging', status: 'inactive' },
  ],
  hope: [
    { id: 'env-3', slug: 'producao', name: 'Produção', status: 'active' },
  ],
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const tenant = MOCK_TENANTS.find(t => t.slug === slug)
  if (!tenant) {
    return Response.json(
      { success: false, error: 'Tenant not found', timestamp: new Date().toISOString() },
      { status: 404 }
    )
  }

  const detail: TenantDetail = {
    ...tenant,
    environments: MOCK_ENVIRONMENTS[slug] ?? [],
  }
  return Response.json({ tenant: detail })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const tenant = MOCK_TENANTS.find(t => t.slug === slug)
  if (!tenant) {
    return Response.json(
      { success: false, error: 'Tenant not found', timestamp: new Date().toISOString() },
      { status: 404 }
    )
  }
  const body = await request.json() as { name?: string; status?: string }
  return Response.json({ tenant: { ...tenant, ...body, updatedAt: new Date().toISOString() } })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const tenant = MOCK_TENANTS.find(t => t.slug === slug)
  if (!tenant) {
    return Response.json(
      { success: false, error: 'Tenant not found', timestamp: new Date().toISOString() },
      { status: 404 }
    )
  }
  if (tenant.status === 'active') {
    return Response.json(
      { success: false, error: 'Cannot delete active tenant', timestamp: new Date().toISOString() },
      { status: 409 }
    )
  }
  return new Response(null, { status: 204 })
}
