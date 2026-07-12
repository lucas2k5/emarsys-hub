import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type PanelUser = {
  id: string
  email: string
  role: 'admin' | 'viewer'
  createdAt: string
}

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data } = await api.get<{ users: PanelUser[] }>('/api/users')
      return data.users
    },
    staleTime: 30_000,
    retry: 1,
  })
}

export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { email: string; password: string; role: 'admin' | 'viewer' }) => {
      const { data } = await api.post<{ user: PanelUser }>('/api/users', payload)
      return data.user
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  })
}

export function useUpdateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...payload }: { id: string; role?: 'admin' | 'viewer'; password?: string }) => {
      const { data } = await api.patch<{ user: PanelUser }>(`/api/users/${id}`, payload)
      return data.user
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  })
}

export function useDeleteUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/users/${id}`)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  })
}
