import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Product } from '@/types/api'

export function useProducts(limit = 100, tenantSlug?: string) {
  return useQuery({
    queryKey: ['products', tenantSlug ?? '_global', limit],
    queryFn: async () => {
      const { data } = await api.get<{ products: Product[] } | Product[]>('/api/vtex/products', {
        params: { limit, ...(tenantSlug ? { tenant: tenantSlug } : {}) },
      })
      return Array.isArray(data) ? data : data.products
    },
    refetchInterval: 30_000,
    staleTime: 20_000,
    retry: 2,
  })
}
