import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type BackgroundJob = {
  id: string
  type: string
  status: 'running' | 'done' | 'failed' | 'pending'
  startedAt: string | null
  progress?: number
}

export function useBackgroundJobs(tenantSlug?: string) {
  return useQuery({
    queryKey: ['background-jobs', tenantSlug ?? '_global'],
    queryFn: async () => {
      const { data } = await api.get<{ jobs: BackgroundJob[] }>('/api/background/jobs', {
        params: tenantSlug ? { tenant: tenantSlug } : undefined,
      })
      return data.jobs
    },
    refetchInterval: 30_000,
    staleTime: 20_000,
    retry: 2,
  })
}
