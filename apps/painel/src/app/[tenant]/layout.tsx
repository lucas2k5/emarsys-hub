'use client'
import { use, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Skeleton } from '@/components/ui/skeleton'
import { useTenants } from '@/hooks/useTenants'

// Guard de tenant: se o slug da URL não existir na lista de tenants carregada,
// redireciona para /clientes evitando estado quebrado.
// Enquanto a lista carrega, exibe skeleton para não fazer flash de redirect incorreto.
export default function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ tenant: string }>
}) {
  const { tenant: slug } = use(params)
  const router = useRouter()
  const { data: tenants, isLoading, isError } = useTenants()

  useEffect(() => {
    if (isLoading) return
    // Em caso de erro de API ou slug não encontrado — redireciona para /clientes
    if (isError) {
      router.replace('/clientes')
      return
    }
    if (tenants && !tenants.some(t => t.slug === slug)) {
      router.replace('/clientes')
    }
  }, [tenants, isLoading, isError, slug, router])

  // Aguarda lista de tenants antes de renderizar para evitar flash
  if (isLoading) {
    return (
      <div className="space-y-4 py-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    )
  }

  // Se tenant não existe na lista (antes do redirect completar), não renderiza
  if (!isLoading && tenants && !tenants.some(t => t.slug === slug)) {
    return null
  }

  return <>{children}</>
}
