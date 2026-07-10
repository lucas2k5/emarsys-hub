import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { OrdersResponse, OrderFilters } from '@/types/api'

export function useOrders(filters: OrderFilters = {}, tenantSlug?: string) {
  return useQuery({
    queryKey: ['orders', tenantSlug ?? '_global', filters],
    queryFn: async () => {
      const { data } = await api.get<OrdersResponse>('/api/emarsys/sales/db-sample', {
        params: { ...filters, ...(tenantSlug ? { tenant: tenantSlug } : {}) },
      })
      return data
    },
    refetchInterval: 30_000,
    staleTime: 20_000,
    retry: 2,
  })
}
