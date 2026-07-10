import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Contact } from '@/types/api'

export function useContacts(limit = 50, tenantSlug?: string) {
  return useQuery({
    queryKey: ['contacts', tenantSlug ?? '_global', limit],
    queryFn: async () => {
      const { data } = await api.get<{ contacts: Contact[] }>('/api/emarsys/contacts/latest', {
        params: { limit, ...(tenantSlug ? { tenant: tenantSlug } : {}) },
      })
      return data.contacts
    },
    refetchInterval: 30_000,
    staleTime: 20_000,
    retry: 2,
  })
}
