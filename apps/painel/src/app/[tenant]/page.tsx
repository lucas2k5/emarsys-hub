'use client'
import { use } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Activity, Package, ShoppingCart, Users, Heart,
  CheckCircle2, Clock, AlertTriangle, XCircle, ArrowRight, FileText, Percent,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { format, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useSyncStats } from '@/hooks/useSyncStats'
import { useContactsStats } from '@/hooks/useContactsStats'
import { useProductStats } from '@/hooks/useProductStats'
import { useOrders } from '@/hooks/useOrders'
import { useContacts } from '@/hooks/useContacts'
import { useErrorLogs } from '@/hooks/useErrorLogs'
import { useWishlist } from '@/hooks/useWishlist'
import { PageHeader } from '@/components/dashboard/PageHeader'
import { KpiCard, type KpiTone } from '@/components/dashboard/KpiCard'
import { ChartCard } from '@/components/dashboard/ChartCard'
import { StatusBadge } from '@/components/dashboard/StatusBadge'
import { SyncDonutChart } from '@/components/dashboard/SyncDonutChart'
import { OrdersLineChart } from '@/components/dashboard/OrdersLineChart'
import { clientTypeBadgeClass, clientTypeLabel } from '@/lib/clientTypeBadge'
import { formatDate, formatRelative, truncate } from '@/lib/utils'
import type { Order } from '@/types/api'

function groupOrdersByDay(orders: Order[]): { date: string; total: number; synced: number }[] {
  const map = new Map<string, { total: number; synced: number }>()
  const last7 = Array.from({ length: 7 }).map((_, i) =>
    format(subDays(new Date(), 6 - i), 'dd/MM', { locale: ptBR })
  )
  last7.forEach(d => map.set(d, { total: 0, synced: 0 }))
  orders.forEach(o => {
    try {
      const d = format(new Date(o.timestamp), 'dd/MM', { locale: ptBR })
      if (map.has(d)) {
        const cur = map.get(d)!
        map.set(d, { total: cur.total + 1, synced: cur.synced + (o.isSync ? 1 : 0) })
      }
    } catch { /* skip */ }
  })
  return Array.from(map.entries()).map(([date, v]) => ({ date, ...v }))
}

/** Cabeçalho de seção: chip de ícone + título + "Ver todos" (visual novo, sem side-stripe). */
function SectionHeader({ title, icon: Icon, tone, href, delay = 0 }: {
  title: string
  icon: LucideIcon
  tone: KpiTone
  href?: string
  delay?: number
}) {
  const chip: Record<KpiTone, string> = {
    primary: 'bg-primary/10 border-primary/20 text-primary',
    highlight: 'bg-highlight/10 border-highlight/20 text-highlight',
    violet: 'bg-violet-500/10 border-violet-500/20 text-violet-400',
    rose: 'bg-rose-500/10 border-rose-500/20 text-rose-400',
    emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    amber: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.4 }}
      className="flex items-center justify-between mb-4"
    >
      <div className="flex items-center gap-2.5">
        <div className={`w-7 h-7 rounded-lg border flex items-center justify-center ${chip[tone]}`}>
          <Icon className="w-3.5 h-3.5" aria-hidden="true" />
        </div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      {href && (
        <Link href={href} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
          Ver todos <ArrowRight className="w-3 h-3" aria-hidden="true" />
        </Link>
      )}
    </motion.div>
  )
}

export default function TenantDashboard({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = use(params)

  const sync = useSyncStats(tenant)
  const contacts = useContactsStats(tenant)
  const product = useProductStats(tenant)
  const orders = useOrders({ limit: 200 }, tenant)
  const recentContacts = useContacts(20, tenant)
  const errorLogs = useErrorLogs(tenant)
  const wishlist = useWishlist(tenant)

  const failedContacts = (recentContacts.data ?? []).filter(c => c.status === 'failed' || c.status === 'dead').slice(0, 6)
  const pendingOrders = (orders.data?.orders ?? []).filter(o => !o.isSync).slice(0, 8)
  const lineData = groupOrdersByDay(orders.data?.orders ?? [])

  const totalContactFailures = (contacts.data?.failed ?? 0) + (contacts.data?.dead ?? 0)
  const failureRate = contacts.data?.total ? ((totalContactFailures / contacts.data.total) * 100).toFixed(1) : null
  const pctSynced = sync.data?.percentSynced

  const wishlistSent = (wishlist.data?.runs ?? []).reduce((acc, r) => acc + (r.stats?.sent ?? 0), 0)
  const wishlistErrors = (wishlist.data?.runs ?? []).reduce((acc, r) => acc + (r.stats?.errors ?? 0) + (r.status === 'failed' ? 1 : 0), 0)
  const lastWishlistRun = wishlist.data?.runs?.[0]
  const wishlistEnvsAtivos = (wishlist.data?.environments ?? []).filter(e => e.enabled).length

  const donutData = [
    { name: 'Enviados',  value: contacts.data?.sent    ?? 0, key: 'sent' },
    { name: 'Pendentes', value: contacts.data?.pending ?? 0, key: 'pending' },
    { name: 'Falhos',    value: contacts.data?.failed  ?? 0, key: 'failed' },
    { name: 'Mortos',    value: contacts.data?.dead    ?? 0, key: 'dead' },
  ]

  return (
    <div className="py-6 max-w-[1600px] mx-auto space-y-10">
      <PageHeader
        title="Visão geral"
        subtitle="Monitoramento em tempo real de todas as integrações"
        icon={Activity}
      />

      {/* ── CONTATOS ─────────────────────────────────────────────────────── */}
      <section>
        <SectionHeader title="Contatos" icon={Users} tone="violet" href={`/${tenant}/contatos`} delay={0.05} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <KpiCard index={0} tone="violet" icon={Users} loading={contacts.isLoading}
            title="Total de contatos" value={contacts.data?.total?.toLocaleString('pt-BR') ?? '—'} />
          <KpiCard index={1} tone="emerald" icon={CheckCircle2} loading={contacts.isLoading}
            title="Enviados" value={contacts.data?.sent?.toLocaleString('pt-BR') ?? '—'} />
          <KpiCard index={2} tone="amber" icon={Clock} loading={contacts.isLoading}
            title="Pendentes" value={contacts.data?.pending?.toLocaleString('pt-BR') ?? '—'} />
          <KpiCard index={3} tone="rose" icon={XCircle} loading={contacts.isLoading}
            title="Falhos + dead-letter" value={totalContactFailures.toLocaleString('pt-BR')}
            sub={failureRate ? `${failureRate}% do total` : undefined} subTone="negative" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ChartCard title="Contatos por status" subtitle="Fila de processamento" delay={0.15}>
            <SyncDonutChart data={donutData} loading={contacts.isLoading} />
          </ChartCard>
          <ChartCard title="Contatos com falha" subtitle="Retry e dead-letter recentes" delay={0.2} className="lg:col-span-2">
            {recentContacts.isLoading ? (
              <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full rounded-lg" />)}</div>
            ) : !failedContacts.length ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400/60" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">Nenhuma falha recente</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b border-border">
                      <th className="pb-3 font-medium">Email</th>
                      <th className="pb-3 font-medium">Status</th>
                      <th className="pb-3 font-medium">Tent.</th>
                      <th className="pb-3 font-medium">Ambiente</th>
                      <th className="pb-3 font-medium">Último erro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {failedContacts.map(c => (
                      <tr key={c.id} className="border-b border-border last:border-0 hover:bg-secondary/30 transition-colors">
                        <td className="py-3 text-xs">{truncate(c.email, 26)}</td>
                        <td className="py-3"><StatusBadge status={c.status === 'dead' ? 'dead' : 'failed'} /></td>
                        <td className="py-3 font-mono text-xs">{c.attempts}</td>
                        <td className="py-3">
                          <Badge variant="outline" className={clientTypeBadgeClass(c.client_type)}>
                            {clientTypeLabel(c.client_type)}
                          </Badge>
                        </td>
                        <td className="py-3 text-xs text-muted-foreground">{truncate(c.last_error, 32)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ChartCard>
        </div>
      </section>

      {/* ── PEDIDOS ──────────────────────────────────────────────────────── */}
      <section>
        <SectionHeader title="Pedidos" icon={ShoppingCart} tone="highlight" href={`/${tenant}/pedidos`} delay={0.1} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <KpiCard index={0} tone="highlight" icon={ShoppingCart} loading={sync.isLoading}
            title="Total de pedidos" value={sync.data?.total?.toLocaleString('pt-BR') ?? '—'} />
          <KpiCard index={1} tone="emerald" icon={CheckCircle2} loading={sync.isLoading}
            title="Sincronizados" value={sync.data?.synced?.toLocaleString('pt-BR') ?? '—'} />
          <KpiCard index={2} tone="amber" icon={Clock} loading={sync.isLoading}
            title="Pendentes" value={sync.data?.pending?.toLocaleString('pt-BR') ?? '—'} />
          <KpiCard index={3} tone="primary" icon={Percent} loading={sync.isLoading}
            title="Taxa de sincronização" value={pctSynced !== undefined ? `${pctSynced.toFixed(1)}%` : '—'}
            sub={sync.data ? `${sync.data.pending.toLocaleString('pt-BR')} aguardando` : undefined}
            subTone={pctSynced !== undefined && pctSynced >= 80 ? 'positive' : 'warning'} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ChartCard title="Pedidos sincronizados" subtitle="Últimos 7 dias" delay={0.2} className="lg:col-span-2">
            <OrdersLineChart data={lineData} loading={orders.isLoading} />
          </ChartCard>
          <ChartCard title="Pedidos pendentes" subtitle="Aguardando envio" delay={0.25}>
            {orders.isLoading ? (
              <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full rounded-lg" />)}</div>
            ) : !pendingOrders.length ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400/60" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">Nenhum pedido pendente</p>
              </div>
            ) : (
              <div className="space-y-1">
                {pendingOrders.map(o => (
                  <div key={o.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-secondary/30 transition-colors">
                    <span className="font-mono text-xs text-highlight">{truncate(o.order, 18)}</span>
                    <StatusBadge status="pending" />
                  </div>
                ))}
                {(orders.data?.orders ?? []).filter(o => !o.isSync).length > 8 && (
                  <Link href={`/${tenant}/pedidos?isSync=false`} className="block text-center text-xs text-muted-foreground hover:text-primary pt-2 transition-colors">
                    + {(orders.data?.orders ?? []).filter(o => !o.isSync).length - 8} mais →
                  </Link>
                )}
              </div>
            )}
          </ChartCard>
        </div>
      </section>

      {/* ── PRODUTOS ─────────────────────────────────────────────────────── */}
      <section>
        <SectionHeader title="Produtos" icon={Package} tone="primary" href={`/${tenant}/produtos`} delay={0.15} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard index={0}
            tone={product.data?.status === 'ok' ? 'emerald' : product.data?.status === 'error' ? 'rose' : 'amber'}
            icon={product.data?.status === 'error' ? AlertTriangle : CheckCircle2}
            loading={product.isLoading}
            title="Status da última sincronização"
            value={product.data?.status === 'ok' ? 'Concluída' : product.data?.status === 'error' ? 'Erro' : 'Sem dados'} />
          <KpiCard index={1} tone="primary" icon={Package} loading={product.isLoading}
            title="Total de SKUs" value={product.data?.total?.toLocaleString('pt-BR') ?? '—'} />
          <KpiCard index={2} tone="highlight" icon={Clock} loading={product.isLoading}
            title="Última sincronização" value={product.data?.lastSync ? formatDate(product.data.lastSync) : '—'}
            sub={product.data?.lastSync ? formatRelative(product.data.lastSync) : undefined} />
          <KpiCard index={3} tone="violet" icon={FileText} loading={product.isLoading}
            title="Último arquivo" value={product.data?.lastFile ?? '—'} />
        </div>
      </section>

      {/* ── WISHLIST ─────────────────────────────────────────────────────── */}
      <section>
        <SectionHeader title="Wishlist" icon={Heart} tone="rose" href={`/${tenant}/wishlist`} delay={0.2} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard index={0} tone="rose" icon={Heart} loading={wishlist.isLoading}
            title="Wishlists enviadas" value={wishlistSent.toLocaleString('pt-BR')}
            sub="últimas execuções" />
          <KpiCard index={1} tone="highlight" icon={Clock} loading={wishlist.isLoading}
            title="Última execução"
            value={lastWishlistRun ? formatRelative(lastWishlistRun.startedAt) : '—'}
            sub={lastWishlistRun ? (lastWishlistRun.status === 'completed' ? 'concluída' : lastWishlistRun.status === 'failed' ? 'falhou' : 'rodando') : 'nenhuma ainda'}
            subTone={lastWishlistRun?.status === 'failed' ? 'negative' : lastWishlistRun?.status === 'completed' ? 'positive' : 'muted'} />
          <KpiCard index={2} tone="emerald" icon={Activity} loading={wishlist.isLoading}
            title="Automações ativas" value={wishlistEnvsAtivos}
            sub={`de ${wishlist.data?.environments?.length ?? 0} ambiente(s)`} />
          <KpiCard index={3} tone={wishlistErrors > 0 ? 'rose' : 'emerald'} icon={wishlistErrors > 0 ? AlertTriangle : CheckCircle2} loading={wishlist.isLoading}
            title="Erros recentes" value={wishlistErrors.toLocaleString('pt-BR')} />
        </div>
      </section>

      {/* ── ERROS DE INTEGRAÇÃO ──────────────────────────────────────────── */}
      <section>
        <SectionHeader title="Erros de integração" icon={AlertTriangle} tone="rose" href={`/${tenant}/logs?level=error`} delay={0.25} />
        <ChartCard title="Últimas ocorrências" subtitle="Clique em Ver todos para a trilha completa com payloads" delay={0.3}>
          {errorLogs.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full rounded-lg" />)}</div>
          ) : !errorLogs.data?.length ? (
            <div className="flex items-center gap-3 py-4">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">Nenhum erro de integração recente</p>
            </div>
          ) : (
            <div className="space-y-3">
              {errorLogs.data.slice(0, 8).map((e, i) => (
                <div key={i} className="flex items-start gap-3 pb-3 border-b border-border last:border-0 last:pb-0">
                  <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center shrink-0">
                    <XCircle className="w-4 h-4 text-rose-400" aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate" title={e.message}>{e.message}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                      <span className="font-mono">{e.orderId}</span>
                      <span>•</span>
                      <span>{formatRelative(e.timestamp)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ChartCard>
      </section>
    </div>
  )
}
