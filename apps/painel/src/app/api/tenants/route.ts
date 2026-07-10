import type { Tenant } from '@/types/api'

export const MOCK_TENANTS: Tenant[] = [
  {
    id: 'tenant-1',
    slug: 'altenburg',
    name: 'Altenburg',
    status: 'active',
    createdAt: '2025-01-10T10:00:00.000Z',
    updatedAt: '2026-06-29T08:00:00.000Z',
  },
  {
    id: 'tenant-2',
    slug: 'hope',
    name: 'Hope',
    status: 'active',
    createdAt: '2025-03-15T10:00:00.000Z',
    updatedAt: '2026-06-28T14:00:00.000Z',
  },
]

export async function GET() {
  return Response.json({ tenants: MOCK_TENANTS })
}

export async function POST(request: Request) {
  const body = await request.json() as { slug: string; name: string }
  const newTenant: Tenant = {
    id: `tenant-${Date.now()}`,
    slug: body.slug,
    name: body.name,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  return Response.json({ tenant: newTenant }, { status: 201 })
}
