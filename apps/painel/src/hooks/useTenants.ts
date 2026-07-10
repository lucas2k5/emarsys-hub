import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Tenant, TenantDetail } from '@/types/api'

export function useTenants() {
  return useQuery({
    queryKey: ['tenants'],
    queryFn: async () => {
      const { data } = await api.get<{ tenants: Tenant[] }>('/api/tenants')
      return data.tenants
    },
    staleTime: 60_000,
    retry: 2,
  })
}

export function useTenant(slug: string) {
  return useQuery({
    queryKey: ['tenant', slug],
    queryFn: async () => {
      const { data } = await api.get<{ tenant: TenantDetail }>(`/api/tenants/${slug}`)
      return data.tenant
    },
    enabled: !!slug,
    staleTime: 30_000,
    retry: 2,
  })
}

export function useCreateTenant() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { slug: string; name: string }) => {
      const { data } = await api.post<{ tenant: Tenant }>('/api/tenants', payload)
      return data.tenant
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] })
    },
  })
}

export function useUpdateTenant(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { name?: string; status?: string }) => {
      const { data } = await api.patch<{ tenant: Tenant }>(`/api/tenants/${slug}`, payload)
      return data.tenant
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] })
      queryClient.invalidateQueries({ queryKey: ['tenant', slug] })
    },
  })
}
