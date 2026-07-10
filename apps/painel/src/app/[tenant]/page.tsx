'use client'
import { use } from 'react'
import { clientTypeBadgeClass, clientTypeLabel } from '@/lib/clientTypeBadge'
import { motion } from 'framer-motion'
import Link from 'next/link'
import {
  AlertCircle,
  Package,
  ArrowRight, CheckCircle2,
  Clock, AlertTriangle, XCircle,
} from 'lucide-react'
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
import { SyncDonutChart } from '@/components/dashboard/SyncDonutChart'
import { OrdersLineChart } from '@/components/dashboard/OrdersLineChart'
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

function SectionHeader({ title, href, accent, delay = 0 }: { title: string; href: string; accent: string; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.4 }}
      className="flex items-center justify-between mb-4"
    >
      <div className={`flex items-center gap-3 pl-3 border-l-2 ${accent}`}>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <Link href={href} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
        Ver todos <ArrowRight className="w-3 h-3" />
      </Link>
    </motion.div>
  )
}

function KpiCard({ label, value, sub, color = 'text-foreground', loading }: { label: string; value: string | number; sub?: string; color?: string; loading?: boolean }) {
  return (
    <div className="p-4 rounded-xl bg-accent/50 border border-border space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      {loading ? <Skeleton className="h-7 w-20" /> : <p className={`text-xl font-bold ${color}`}>{value}</p>}
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
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

  const failedContacts = (recentContacts.data ?? []).filter(c => c.status === 'failed' || c.status === 'dead').slice(0, 8)
  const pendingOrders = (orders.data?.orders ?? []).filter(o => !o.isSync).slice(0, 8)

  const donutData = [
    { name: 'Enviados',  value: contacts.data?.sent    ?? 0, key: 'sent' },
    { name: 'Pendentes', value: contacts.data?.pending ?? 0, key: 'pending' },
    { name: 'Falhos',    value: contacts.data?.failed  ?? 0, key: 'failed' },
    { name: 'Mortos',    value: contacts.data?.dead    ?? 0, key: 'dead' },
  ]

  const lineData = groupOrdersByDay(orders.data?.orders ?? [])
  const totalContactFailures = (contacts.data?.failed ?? 0) + (contacts.data?.dead ?? 0)
  const failureRate = contacts.data?.total ? ((totalContactFailures / contacts.data.total) * 100).toFixed(1) : '—'

  return (
    <div className="space-y-10 py-6">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Monitoramento em tempo real — VTEX → SAP Emarsys</p>
      </motion.div>

      {/* CONTATOS */}
      <section className="space-y-4">
        <SectionHeader title="Contatos" href={`/${tenant}/contatos`} accent="border-purple-500" delay={0.05} />
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.4 }} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label="Total de contatos" value={contacts.data?.total?.toLocaleString('pt-BR') ?? '—'} loading={contacts.isLoading} />
          <KpiCard label="Enviados" value={contacts.data?.sent?.toLocaleString('pt-BR') ?? '—'} color="text-emerald-400" loading={contacts.isLoading} />
          <KpiCard label="Falhos + mortos" value={totalContactFailures.toLocaleString('pt-BR')} color="text-red-400" sub={`${failureRate}% do total`} loading={contacts.isLoading} />
          <KpiCard label="Pendentes" value={contacts.data?.pending?.toLocaleString('pt-BR') ?? '—'} color="text-yellow-400" loading={contacts.isLoading} />
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-4">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.5 }} className="p-5 rounded-2xl border border-border bg-card flex flex-col gap-4">
            <SyncDonutChart data={donutData} loading={contacts.isLoading} />
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.5 }} className="lg:col-span-2 p-5 rounded-2xl border border-border bg-card">
            <p className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
              <XCircle className="w-3 h-3 text-red-400" />
              Contatos com falha (recentes)
            </p>
            {recentContacts.isLoading ? (
              <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full rounded-lg" />)}</div>
            ) : !failedContacts.length ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                <p className="text-xs text-muted-foreground">Nenhuma falha recente</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-border">
                    <th className="text-left py-2 px-2 text-muted-foreground font-medium">Email</th>
                    <th className="text-left py-2 px-2 text-muted-foreground font-medium">Status</th>
                    <th className="text-left py-2 px-2 text-muted-foreground font-medium">Tent.</th>
                    <th className="text-left py-2 px-2 text-muted-foreground font-medium">Tipo</th>
                    <th className="text-left py-2 px-2 text-muted-foreground font-medium">Último erro</th>
                  </tr></thead>
                  <tbody>
                    {failedContacts.map(c => (
                      <tr key={c.id} className="border-b border-border hover:bg-accent/30 transition-colors">
                        <td className="py-2 px-2">{truncate(c.email, 26)}</td>
                        <td className="py-2 px-2">
                          <Badge variant="outline" className={c.status === 'dead' ? 'border-red-500/30 text-red-400 bg-red-500/10' : 'border-orange-500/30 text-orange-400 bg-orange-500/10'}>
                            {c.status}
                          </Badge>
                        </td>
                        <td className="py-2 px-2 font-mono text-center">{c.attempts}</td>
                        <td className="py-2 px-2">
                          <Badge variant="outline" className={clientTypeBadgeClass(c.client_type)}>
                            {clientTypeLabel(c.client_type)}
                          </Badge>
                        </td>
                        <td className="py-2 px-2 text-muted-foreground">{truncate(c.last_error, 30)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        </div>
      </section>

      {/* PEDIDOS */}
      <section className="space-y-4">
        <SectionHeader title="Pedidos" href={`/${tenant}/pedidos`} accent="border-sky-500" delay={0.3} />
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.4 }} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label="Total de pedidos" value={sync.data?.total?.toLocaleString('pt-BR') ?? '—'} loading={sync.isLoading} />
          <KpiCard label="Sincronizados" value={sync.data?.synced?.toLocaleString('pt-BR') ?? '—'} color="text-emerald-400" loading={sync.isLoading} />
          <KpiCard label="Pendentes" value={sync.data?.pending?.toLocaleString('pt-BR') ?? '—'} color="text-yellow-400" loading={sync.isLoading} />
          <KpiCard label="Taxa de sincronização" value={sync.data ? `${sync.data.percentSynced.toFixed(1)}%` : '—'} color={sync.data && sync.data.percentSynced >= 80 ? 'text-emerald-400' : 'text-orange-400'} sub={`${sync.data?.pending ?? 0} aguardando`} loading={sync.isLoading} />
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-4">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.5 }} className="lg:col-span-2 p-5 rounded-2xl border border-border bg-card space-y-3">
            <p className="text-xs text-muted-foreground">Pedidos — últimos 7 dias</p>
            <OrdersLineChart data={lineData} loading={orders.isLoading} />
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45, duration: 0.5 }} className="p-5 rounded-2xl border border-border bg-card">
            <p className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
              <Clock className="w-3 h-3 text-yellow-400" />
              Pedidos pendentes (últimos)
            </p>
            {orders.isLoading ? (
              <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full rounded-lg" />)}</div>
            ) : !pendingOrders.length ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                <p className="text-xs text-muted-foreground">Nenhum pendente</p>
              </div>
            ) : (
              <div className="space-y-1">
                {pendingOrders.map(o => (
                  <div key={o.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-accent transition-colors">
                    <span className="font-mono text-xs text-sky-400">{truncate(o.order, 18)}</span>
                    <Badge variant="outline" className="border-yellow-500/30 text-yellow-400 bg-yellow-500/10 text-xs">Pendente</Badge>
                  </div>
                ))}
                {(orders.data?.orders ?? []).filter(o => !o.isSync).length > 8 && (
                  <Link href={`/${tenant}/pedidos?isSync=false`} className="block text-center text-xs text-muted-foreground hover:text-primary pt-2 transition-colors">
                    + {(orders.data?.orders ?? []).filter(o => !o.isSync).length - 8} mais →
                  </Link>
                )}
              </div>
            )}
          </motion.div>
        </div>
      </section>

      {/* PRODUTOS */}
      <section className="space-y-4">
        <SectionHeader title="Produtos" href={`/${tenant}/produtos`} accent="border-emerald-500" delay={0.4} />
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45, duration: 0.4 }} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-4 rounded-xl bg-accent/50 border border-border flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${product.isLoading ? 'bg-accent' : product.data?.status === 'ok' ? 'bg-emerald-500/10 border border-emerald-500/20' : product.data?.status === 'error' ? 'bg-red-500/10 border border-red-500/20' : 'bg-accent border border-border'}`}>
              {product.isLoading ? <Package className="w-4 h-4 text-muted-foreground" /> : product.data?.status === 'ok' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : product.data?.status === 'error' ? <AlertTriangle className="w-4 h-4 text-red-400" /> : <Clock className="w-4 h-4 text-muted-foreground" />}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              {product.isLoading ? <Skeleton className="h-5 w-16 mt-1" /> : <p className={`text-sm font-semibold ${product.data?.status === 'ok' ? 'text-emerald-400' : product.data?.status === 'error' ? 'text-red-400' : 'text-muted-foreground'}`}>{product.data?.status === 'ok' ? 'Concluído' : product.data?.status === 'error' ? 'Erro' : 'Sem dados'}</p>}
            </div>
          </div>
          <KpiCard label="Total de SKUs" value={product.data?.total?.toLocaleString('pt-BR') ?? '—'} color="text-purple-400" loading={product.isLoading} />
          <KpiCard label="Última sincronização" value={formatDate(product.data?.lastSync) ?? '—'} loading={product.isLoading} sub={product.data?.lastSync ? formatRelative(product.data.lastSync) : undefined} />
          <KpiCard label="Último arquivo" value={product.data?.lastFile ?? '—'} loading={product.isLoading} />
        </motion.div>
      </section>

      {/* ERROS DE INTEGRAÇÃO */}
      <section className="space-y-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.4 }} className="flex items-center justify-between">
          <div className="flex items-center gap-3 pl-3 border-l-2 border-red-500">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400" />
              Erros de integração
            </h2>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55, duration: 0.5 }} className="p-5 rounded-2xl border border-border bg-card">
          {errorLogs.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full rounded-lg" />)}</div>
          ) : !errorLogs.data?.length ? (
            <div className="flex items-center gap-3 py-4">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <p className="text-sm text-muted-foreground">Nenhum erro de integração recente</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">Pedido</th>
                  <th className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">Mensagem</th>
                  <th className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">Quando</th>
                </tr></thead>
                <tbody>
                  {errorLogs.data.slice(0, 10).map((e, i) => (
                    <tr key={i} className="border-b border-border hover:bg-accent/30 transition-colors">
                      <td className="py-2.5 px-3 font-mono text-xs text-sky-400 whitespace-nowrap">{e.orderId}</td>
                      <td className="py-2.5 px-3 text-xs text-red-400">{truncate(e.message, 60)}</td>
                      <td className="py-2.5 px-3 text-xs text-muted-foreground whitespace-nowrap">{formatRelative(e.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      </section>
    </div>
  )
}
