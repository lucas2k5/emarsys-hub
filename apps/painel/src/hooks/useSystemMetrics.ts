import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { SystemMetrics } from '@/types/api'

export function useSystemMetrics(tenantSlug?: string) {
  return useQuery({
    queryKey: ['system-metrics', tenantSlug ?? '_global'],
    queryFn: async () => {
      const { data } = await api.get<SystemMetrics>('/api/metrics/json')
      return data
    },
    refetchInterval: 30_000,
    staleTime: 20_000,
    retry: 2,
  })
}
