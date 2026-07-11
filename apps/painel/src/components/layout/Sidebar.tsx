'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  Package,
  Settings2,
  ChevronLeft,
  ChevronRight,
  Zap,
  Menu,
  Building2,
  ChevronsUpDown,
 Heart } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { useTenants } from '@/hooks/useTenants'

// Extrai tenant slug do pathname, excluindo segmentos de nível de sistema
function getTenantFromPath(pathname: string): string | null {
  const excluded = new Set(['clientes', 'login', 'api'])
  const parts = pathname.split('/').filter(Boolean)
  if (!parts.length) return null
  if (excluded.has(parts[0])) return null
  return parts[0]
}

// Extrai a sub-rota atual — ex: "/altenburg/pedidos" → "pedidos"
function getSubRouteFromPath(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length <= 1) return ''
  return parts.slice(1).join('/')
}

type NavItem = { key: string; label: string; icon: typeof LayoutDashboard }

const tenantNavItems: NavItem[] = [
  { key: '', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'pedidos', label: 'Pedidos', icon: ShoppingCart },
  { key: 'contatos', label: 'Contatos', icon: Users },
  { key: 'produtos', label: 'Produtos', icon: Package },
  { key: 'wishlist', label: 'Wishlist', icon: Heart },
  { key: 'sistema', label: 'Sistema', icon: Settings2 },
]

function TenantSelector({ currentTenant, collapsed }: { currentTenant: string | null; collapsed: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const { data: tenants } = useTenants()
  const subRoute = getSubRouteFromPath(pathname)

  if (!tenants?.length) return null

  function handleChange(slug: string) {
    if (slug === currentTenant) return
    const next = subRoute ? `/${slug}/${subRoute}` : `/${slug}`
    router.push(next)
  }

  if (collapsed) {
    const current = tenants.find(t => t.slug === currentTenant)
    return (
      <div className="px-2 pb-2">
        <div
          className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500/20 to-purple-500/20 border border-border flex items-center justify-center mx-auto"
          title={current?.name ?? 'Tenant'}
        >
          <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="px-2 pb-2">
      <div className="relative">
        <select
          value={currentTenant ?? ''}
          onChange={e => handleChange(e.target.value)}
          className="w-full appearance-none text-xs rounded-xl border border-border bg-accent px-3 py-2 pr-8 text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
          aria-label="Selecionar tenant"
        >
          <option value="" disabled>Selecionar cliente...</option>
          {tenants.map(t => (
            <option key={t.slug} value={t.slug}>{t.name}</option>
          ))}
        </select>
        <ChevronsUpDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
      </div>
    </div>
  )
}

function Logo({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className={cn('flex items-center gap-3', collapsed && 'justify-center')}>
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-purple-500 flex items-center justify-center flex-shrink-0">
        <Zap className="w-4 h-4 text-white" />
      </div>
      {!collapsed && (
        <div>
          <p className="font-semibold text-sm text-foreground leading-tight">Emarsys-Hub</p>
          <p className="text-xs text-muted-foreground">Multi-tenant</p>
        </div>
      )}
    </div>
  )
}

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="lg:hidden flex items-center justify-center w-8 h-8 rounded-lg hover:bg-accent transition-colors"
      aria-label="Abrir menu"
    >
      <Menu className="w-4 h-4 text-muted-foreground" />
    </button>
  )
}

export function MobileSidebar() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const currentTenant = getTenantFromPath(pathname)

  return (
    <>
      <MobileMenuButton onClick={() => setOpen(true)} />
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="bg-sidebar border-sidebar-border w-64 p-0 flex flex-col">
          <SheetHeader className="px-4 h-14 flex flex-row items-center border-b border-sidebar-border flex-shrink-0">
            <SheetTitle asChild><Logo /></SheetTitle>
          </SheetHeader>
          <div className="pt-3 flex-shrink-0">
            <TenantSelector currentTenant={currentTenant} collapsed={false} />
          </div>
          <MobileNavLinks currentTenant={currentTenant} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  )
}

function MobileNavLinks({ currentTenant, onNavigate }: { currentTenant: string | null; onNavigate?: () => void }) {
  const pathname = usePathname()
  const subRoute = getSubRouteFromPath(pathname)

  return (
    <nav className="flex-1 p-2 space-y-1">
      {currentTenant && tenantNavItems.map(({ key, label, icon: Icon }) => {
        const href = key ? `/${currentTenant}/${key}` : `/${currentTenant}`
        const active = key === '' ? subRoute === '' : subRoute === key
        return (
          <Link
            key={key}
            href={href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
              active
                ? 'bg-primary/10 text-primary border border-primary/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            )}
          >
            <Icon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
            {label}
          </Link>
        )
      })}
      <div className="h-px bg-border my-2" />
      <Link
        href="/clientes"
        onClick={onNavigate}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
          pathname.startsWith('/clientes')
            ? 'bg-primary/10 text-primary border border-primary/20'
            : 'text-muted-foreground hover:text-foreground hover:bg-accent'
        )}
      >
        <Building2 className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
        Clientes
      </Link>
    </nav>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const currentTenant = getTenantFromPath(pathname)
  const subRoute = getSubRouteFromPath(pathname)

  return (
    <aside
      className={cn(
        'hidden lg:flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300 relative flex-shrink-0',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo */}
      <div className={cn('flex items-center gap-3 px-4 h-14 border-b border-sidebar-border', collapsed && 'justify-center px-0')}>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-purple-500 flex items-center justify-center flex-shrink-0">
          <Zap className="w-4 h-4 text-white" />
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <p className="font-semibold text-sm text-foreground whitespace-nowrap">Emarsys-Hub</p>
              <p className="text-xs text-muted-foreground whitespace-nowrap">Multi-tenant</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Seletor de tenant */}
      <div className="pt-3">
        <TenantSelector currentTenant={currentTenant} collapsed={collapsed} />
      </div>

      {/* Nav items */}
      <nav className="flex-1 p-2 space-y-1">
        {currentTenant && tenantNavItems.map(({ key, label, icon: Icon }) => {
          const href = key ? `/${currentTenant}/${key}` : `/${currentTenant}`
          const active = key === '' ? subRoute === '' : subRoute === key
          return (
            <Link
              key={key}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                collapsed && 'justify-center px-0',
                active
                  ? 'bg-primary/10 text-primary border border-primary/20'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              <AnimatePresence>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden whitespace-nowrap"
                  >
                    {label}
                  </motion.span>
                )}
              </AnimatePresence>
            </Link>
          )
        })}

        <div className="h-px bg-border my-2" />

        {/* Clientes (fora do segmento [tenant]) */}
        <Link
          href="/clientes"
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
            collapsed && 'justify-center px-0',
            pathname.startsWith('/clientes')
              ? 'bg-primary/10 text-primary border border-primary/20'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          )}
        >
          <Building2 className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden whitespace-nowrap"
              >
                Clientes
              </motion.span>
            )}
          </AnimatePresence>
        </Link>
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-secondary border border-border flex items-center justify-center hover:border-border/60 transition-colors"
        aria-label={collapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
      >
        {collapsed
          ? <ChevronRight className="w-3 h-3 text-muted-foreground" />
          : <ChevronLeft className="w-3 h-3 text-muted-foreground" />
        }
      </button>
    </aside>
  )
}
