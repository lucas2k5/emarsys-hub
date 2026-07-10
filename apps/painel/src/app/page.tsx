'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Skeleton } from '@/components/ui/skeleton'
import { useTenants } from '@/hooks/useTenants'

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
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="space-y-3 w-48">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  )
}
