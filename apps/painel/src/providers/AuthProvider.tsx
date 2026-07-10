'use client'
import { createContext, useContext } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import type { AuthUser } from '@/types/api'

// Bypass de mock SOMENTE em desenvolvimento local sem URL de API configurada.
// Em produção (NODE_ENV === 'production'), auth é sempre obrigatório independente
// da variável de ambiente — se a variável estiver vazia em produção a UI exibe
// aviso de configuração em vez de dar acesso.
const IS_MOCK =
  process.env.NODE_ENV !== 'production' &&
  !process.env.NEXT_PUBLIC_API_URL

const MOCK_USER: AuthUser = { id: 'mock', email: 'mock@local', role: 'admin' }

type AuthCtx = {
  user: AuthUser | null
  isLoading: boolean
}

const AuthContext = createContext<AuthCtx>({ user: null, isLoading: false })

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()

  const { data: user, isLoading, isError } = useQuery({
    queryKey: ['auth-me'],
    queryFn: async (): Promise<AuthUser> => {
      if (IS_MOCK) return MOCK_USER

      // Em produção sem URL configurada — não faz request, sinaliza erro
      if (!process.env.NEXT_PUBLIC_API_URL) {
        throw new Error('NEXT_PUBLIC_API_URL não configurada')
      }

      const { data } = await api.get<{ user: AuthUser }>('/auth/me')
      return data.user
    },
    retry: false,
    staleTime: 60_000,
    refetchInterval: IS_MOCK ? false : 120_000,
  })

  useEffect(() => {
    if (IS_MOCK) return
    if (!isLoading && isError && pathname !== '/login') {
      router.push('/login')
    }
  }, [isLoading, isError, pathname, router])

  // Produção sem NEXT_PUBLIC_API_URL configurada — aviso claro
  if (
    process.env.NODE_ENV === 'production' &&
    !process.env.NEXT_PUBLIC_API_URL
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="max-w-sm text-center space-y-3">
          <p className="text-lg font-semibold text-foreground">API não configurada</p>
          <p className="text-sm text-muted-foreground">
            A variável <code className="font-mono bg-accent px-1 rounded">NEXT_PUBLIC_API_URL</code> não está definida.
            Configure-a apontando para o backend antes de usar o painel em produção.
          </p>
        </div>
      </div>
    )
  }

  // Aguardando verificação de auth (não-mock, não na página de login)
  if (!IS_MOCK && isLoading && pathname !== '/login') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="space-y-3 w-64">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    )
  }

  return (
    <AuthContext.Provider value={{ user: user ?? null, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}
