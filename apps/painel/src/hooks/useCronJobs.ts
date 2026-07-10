import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { CronJob } from '@/types/api'

export function useCronJobs(tenantSlug?: string) {
  return useQuery({
    queryKey: ['cron-jobs', tenantSlug ?? '_global'],
    queryFn: async () => {
      const { data } = await api.get<{ jobs: CronJob[] }>('/api/cron-management/status', {
        params: tenantSlug ? { tenant: tenantSlug } : undefined,
      })
      return data.jobs
    },
    refetchInterval: 30_000,
    staleTime: 20_000,
    retry: 2,
  })
}
