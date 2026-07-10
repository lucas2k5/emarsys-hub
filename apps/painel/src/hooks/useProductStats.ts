import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ProductSyncStats } from '@/types/api'

export function useProductStats(tenantSlug?: string) {
  return useQuery({
    queryKey: ['product-stats', tenantSlug ?? '_global'],
    queryFn: async () => {
      const { data } = await api.get<ProductSyncStats>('/api/vtex/products/stats', {
        params: tenantSlug ? { tenant: tenantSlug } : undefined,
      })
      return data
    },
    refetchInterval: 30_000,
    staleTime: 20_000,
    retry: 2,
  })
}
