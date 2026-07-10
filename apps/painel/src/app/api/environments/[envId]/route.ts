import type { EnvironmentDetail } from '@/types/api'

const MOCK_ENV_DETAILS: Record<string, EnvironmentDetail> = {
  'env-1': {
    id: 'env-1',
    slug: 'producao',
    name: 'Produção',
    status: 'active',
    connections: [
      { kind: 'vtex', config: { baseUrl: 'https://altenburg.myvtex.com', appKey: 'vtex-key-xxx' }, hasSecrets: true },
      { kind: 'emarsys_oauth2', config: { tokenEndpoint: 'https://auth.emarsys.net/oauth2/token', clientId: 'client-123' }, hasSecrets: true },
      { kind: 'sftp_products', config: { host: 'exchange.si.emarsys.net', port: '22', username: 'bu_altenburg', remotePath: '/catalog/' }, hasSecrets: true },
      { kind: 'contacts_webhook', config: { url: 'https://hooks.emarsys.net/altenburg', timeout: '30000' }, hasSecrets: false },
    ],
    fieldMappings: [
      { fieldKey: 'email', emarsysFieldId: '3', isExternalId: false },
      { fieldKey: 'customer_id', emarsysFieldId: '29001', isExternalId: true },
      { fieldKey: 'first_name', emarsysFieldId: '1', isExternalId: false },
      { fieldKey: 'last_name', emarsysFieldId: '2', isExternalId: false },
    ],
    flows: [
      { flow: 'products', enabled: true, cronExpression: '0 */8 * * *', settings: {} },
      { flow: 'orders', enabled: true, cronExpression: '*/30 * * * *', settings: {} },
      { flow: 'contacts', enabled: true, cronExpression: '*/5 * * * *', settings: {} },
      { flow: 'wishlist', enabled: false, cronExpression: null, settings: {} },
    ],
  },
  'env-2': {
    id: 'env-2',
    slug: 'staging',
    name: 'Staging',
    status: 'inactive',
    connections: [
      { kind: 'vtex', config: { baseUrl: 'https://altenburg.myvtex.com' }, hasSecrets: false },
    ],
    fieldMappings: [],
    flows: [
      { flow: 'products', enabled: false, cronExpression: null, settings: {} },
      { flow: 'orders', enabled: false, cronExpression: null, settings: {} },
      { flow: 'contacts', enabled: false, cronExpression: null, settings: {} },
      { flow: 'wishlist', enabled: false, cronExpression: null, settings: {} },
    ],
  },
  'env-3': {
    id: 'env-3',
    slug: 'producao',
    name: 'Produção',
    status: 'active',
    connections: [
      { kind: 'vtex', config: { baseUrl: 'https://hope.myvtex.com', appKey: 'vtex-key-yyy' }, hasSecrets: true },
      { kind: 'emarsys_wsse', config: { username: 'hope_wsse' }, hasSecrets: true },
    ],
    fieldMappings: [
      { fieldKey: 'email', emarsysFieldId: '3', isExternalId: false },
      { fieldKey: 'customer_id', emarsysFieldId: '29001', isExternalId: true },
    ],
    flows: [
      { flow: 'products', enabled: true, cronExpression: '0 */8 * * *', settings: {} },
      { flow: 'orders', enabled: false, cronExpression: null, settings: {} },
      { flow: 'contacts', enabled: true, cronExpression: '*/5 * * * *', settings: {} },
      { flow: 'wishlist', enabled: false, cronExpression: null, settings: {} },
    ],
  },
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ envId: string }> }
) {
  const { envId } = await params
  const env = MOCK_ENV_DETAILS[envId]
  if (!env) {
    return Response.json(
      { success: false, error: 'Environment not found', timestamp: new Date().toISOString() },
      { status: 404 }
    )
  }
  return Response.json({ environment: env })
}
