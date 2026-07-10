import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { HealthStatus } from '@/types/api'

export function useHealth(tenantSlug?: string) {
  return useQuery({
    queryKey: ['health', tenantSlug ?? '_global'],
    queryFn: async () => {
      const { data } = await api.get<HealthStatus>('/health')
      return data
    },
    refetchInterval: 15_000,
    staleTime: 10_000,
    retry: 1,
  })
}
