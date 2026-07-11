import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type WishlistEnvStatus = {
  environmentId: string
  envSlug: string
  envName: string
  tenantSlug: string
  enabled: boolean
  cronExpression: string | null
  checkpoint: string | null
  lastRunAt: string | null
  lastStatus: string | null
}

export type WishlistRun = {
  id: string
  envSlug: string
  status: 'running' | 'completed' | 'failed'
  trigger: 'manual' | 'cron'
  progress: number
  stats: { collected?: number; sent?: number; errors?: number; checkpoint?: string; debug?: boolean }
  error: string | null
  startedAt: string
  finishedAt: string | null
}

export type WishlistStatus = {
  environments: WishlistEnvStatus[]
  runs: WishlistRun[]
}

export function useWishlist(tenantSlug?: string) {
  return useQuery({
    queryKey: ['wishlist-status', tenantSlug ?? '_global'],
    queryFn: async () => {
      const { data } = await api.get<WishlistStatus>('/api/wishlist/status', {
        params: tenantSlug ? { tenant: tenantSlug } : undefined,
      })
      return data
    },
    refetchInterval: 30_000,
    staleTime: 20_000,
    retry: 2,
  })
}
