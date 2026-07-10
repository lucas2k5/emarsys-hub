import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ErrorLog } from '@/types/api'

export function useErrorLogs(tenantSlug?: string) {
  return useQuery({
    queryKey: ['error-logs', tenantSlug ?? '_global'],
    queryFn: async () => {
      const { data } = await api.get<{ errors: ErrorLog[] }>('/api/integration/sync/error-logs', {
        params: tenantSlug ? { tenant: tenantSlug } : undefined,
      })
      return data.errors
    },
    refetchInterval: 30_000,
    staleTime: 20_000,
    retry: 2,
  })
}
