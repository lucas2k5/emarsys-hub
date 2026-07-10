import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ContactsStats } from '@/types/api'

export function useContactsStats(tenantSlug?: string) {
  return useQuery({
    queryKey: ['contacts-stats', tenantSlug ?? '_global'],
    queryFn: async () => {
      const { data } = await api.get<ContactsStats>('/api/metrics/contacts/retry-status', {
        params: tenantSlug ? { tenant: tenantSlug } : undefined,
      })
      return data
    },
    refetchInterval: 30_000,
    staleTime: 20_000,
    retry: 2,
  })
}
