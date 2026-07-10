import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { EnvironmentDetail, FieldMapping, FlowKey } from '@/types/api'

export function useEnvironment(envId: string) {
  return useQuery({
    queryKey: ['environment', envId],
    queryFn: async () => {
      const { data } = await api.get<{ environment: EnvironmentDetail }>(`/api/environments/${envId}`)
      return data.environment
    },
    enabled: !!envId,
    staleTime: 30_000,
    retry: 2,
  })
}

export function useUpdateConnection(envId: string, kind: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { config: Record<string, string>; secrets?: Record<string, string> }) => {
      const { data } = await api.put(`/api/environments/${envId}/connections/${kind}`, payload)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['environment', envId] })
    },
  })
}

export function useUpdateFieldMappings(envId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (mappings: FieldMapping[]) => {
      const { data } = await api.put(`/api/environments/${envId}/field-mappings`, { mappings })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['environment', envId] })
    },
  })
}

export function useUpdateFlow(envId: string, flow: FlowKey) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { enabled: boolean; cronExpression?: string | null; settings?: Record<string, unknown> }) => {
      const { data } = await api.put(`/api/environments/${envId}/flows/${flow}`, payload)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['environment', envId] })
    },
  })
}

export function useCreateEnvironment(tenantSlug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { slug: string; name: string }) => {
      const { data } = await api.post(`/api/tenants/${tenantSlug}/environments`, payload)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant', tenantSlug] })
    },
  })
}
