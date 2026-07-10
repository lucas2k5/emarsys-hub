'use client'
import { RefreshCw, Sun, Moon, LogOut } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTheme } from 'next-themes'
import { useRouter } from 'next/navigation'
import { useHealth } from '@/hooks/useHealth'
import { formatRelative } from '@/lib/utils'
import { MobileSidebar } from './Sidebar'
import { api } from '@/lib/api'

export function Header() {
  const { data: health, isLoading, dataUpdatedAt } = useHealth()
  const queryClient = useQueryClient()
  const [refreshing, setRefreshing] = useState(false)
  const { resolvedTheme, setTheme } = useTheme()
  const router = useRouter()
  const isOnline = health?.ok ?? false

  async function handleRefresh() {
    setRefreshing(true)
    await queryClient.invalidateQueries()
    setTimeout(() => setRefreshing(false), 800)
  }

  async function handleLogout() {
    try {
      await api.post('/auth/logout')
    } catch { /* ignora erros de logout */ }
    queryClient.clear()
    router.push('/login')
  }

  return (
    <header className="h-14 flex items-center gap-3 px-4 lg:px-8 border-b border-border bg-background/80 backdrop-blur sticky top-0 z-50">
      <MobileSidebar />

      <div className="flex items-center gap-4 ml-auto">
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className="w-3 h-3" aria-hidden="true" />
          <span>
            {dataUpdatedAt
              ? `Atualizado ${formatRelative(new Date(dataUpdatedAt).toISOString())}`
              : 'Atualizando...'}
          </span>
        </div>

        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:border-border/80 text-xs text-muted-foreground hover:text-foreground transition-all disabled:opacity-50"
          aria-label="Atualizar dados"
        >
          <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
          <span className="hidden sm:inline">Atualizar</span>
        </button>

        <button
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          className="flex items-center justify-center w-8 h-8 rounded-lg border border-border hover:border-border/80 text-muted-foreground hover:text-foreground transition-all"
          aria-label="Alternar tema"
        >
          {resolvedTheme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
        </button>

        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full transition-colors flex-shrink-0 ${
              isLoading
                ? 'bg-yellow-500 animate-pulse'
                : isOnline
                  ? 'bg-emerald-500'
                  : 'bg-red-500'
            }`}
            aria-label={isLoading ? 'Verificando API' : isOnline ? 'API online' : 'API offline'}
          />
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {isLoading ? 'Verificando...' : isOnline ? 'API online' : 'API offline'}
          </span>
        </div>

        <button
          onClick={handleLogout}
          className="flex items-center justify-center w-8 h-8 rounded-lg border border-border hover:border-red-500/40 hover:text-red-400 text-muted-foreground transition-all"
          aria-label="Sair"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  )
}
