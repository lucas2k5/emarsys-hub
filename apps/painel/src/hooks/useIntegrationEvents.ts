import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type IntegrationEventSummary = {
  id: number
  flow: 'products' | 'orders' | 'contacts' | 'wishlist'
  direction: 'outbound' | 'inbound'
  level: 'info' | 'warn' | 'error'
  event: string
  subject: string | null
  statusCode: number | null
  durationMs: number | null
  createdAt: string
  envSlug: string
}

export type IntegrationEventDetail = IntegrationEventSummary & {
  requestPayload: unknown
  responsePayload: unknown
  runId: string | null
}

export type EventFilters = {
  flow?: string
  level?: string
  q?: string
  limit?: number
  offset?: number
}

export function useIntegrationEvents(filters: EventFilters, tenantSlug?: string) {
  return useQuery({
    queryKey: ['integration-events', tenantSlug ?? '_global', filters],
    queryFn: async () => {
      const { data } = await api.get<{ events: IntegrationEventSummary[]; total: number }>(
        '/api/integration/events',
        { params: { ...filters, ...(tenantSlug ? { tenant: tenantSlug } : {}) } },
      )
      return data
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: 2,
  })
}

export function useIntegrationEvent(id: number | null, tenantSlug?: string) {
  return useQuery({
    queryKey: ['integration-event', id, tenantSlug ?? '_global'],
    queryFn: async () => {
      const { data } = await api.get<{ event: IntegrationEventDetail }>(
        `/api/integration/events/${id}`,
        { params: tenantSlug ? { tenant: tenantSlug } : undefined },
      )
      return data.event
    },
    enabled: id !== null,
    staleTime: 60_000,
  })
}
