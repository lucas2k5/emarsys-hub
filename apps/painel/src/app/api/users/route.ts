// Mock do backoffice de usuários (modo dev sem API)
const USERS = [
  { id: 'u-1', email: 'admin@exemplo.com', role: 'admin', createdAt: '2026-06-01T10:00:00.000Z' },
  { id: 'u-2', email: 'analista@exemplo.com', role: 'viewer', createdAt: '2026-06-15T14:30:00.000Z' },
]
export async function GET() {
  return Response.json({ success: true, users: USERS })
}
export async function POST() {
  return Response.json({ success: true, user: USERS[1] }, { status: 201 })
}
