import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { SyncStats } from '@/types/api'

export function useSyncStats(tenantSlug?: string) {
  return useQuery({
    queryKey: ['sync-stats', tenantSlug ?? '_global'],
    queryFn: async () => {
      const { data } = await api.get<SyncStats>('/api/emarsys/sales/sync-status', {
        params: tenantSlug ? { tenant: tenantSlug } : undefined,
      })
      return data
    },
    refetchInterval: 30_000,
    staleTime: 20_000,
    retry: 2,
  })
}
