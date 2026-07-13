'use client'
import { useEffect } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useTenants } from '@/hooks/useTenants'

/**
 * Página inicial: resolve o destino (primeiro cliente ativo ou /clientes)
 * exibindo a marca enquanto decide — em vez de skeletons anônimos.
 */
export default function RootPage() {
  const router = useRouter()
  const { data: tenants, isLoading, isError } = useTenants()

  useEffect(() => {
    if (isLoading) return
    if (isError || !tenants?.length) {
      router.replace('/clientes')
      return
    }
    const first = tenants.find(t => t.status === 'active') ?? tenants[0]
    router.replace(`/${first.slug}`)
  }, [tenants, isLoading, isError, router])

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-5">
      <Image
        src="/logo-transparent.png"
        alt="Connect-hub"
        width={132}
        height={80}
        priority
        className="h-20 w-auto animate-pulse [animation-duration:1.6s]"
      />
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="w-3.5 h-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin" aria-hidden="true" />
        Carregando seu painel…
      </div>
    </div>
  )
}
