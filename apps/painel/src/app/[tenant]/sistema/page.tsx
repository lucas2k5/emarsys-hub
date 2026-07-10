'use client'
import { use } from 'react'
import { motion } from 'framer-motion'
import { Activity, Clock, AlertCircle, HardDrive } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useSystemMetrics } from '@/hooks/useSystemMetrics'
import { useHealth } from '@/hooks/useHealth'
import { useCronJobs } from '@/hooks/useCronJobs'
import { useErrorLogs } from '@/hooks/useErrorLogs'
import { CronJobsTable } from '@/components/dashboard/CronJobsTable'
import { formatDate, formatUptime } from '@/lib/utils'

export default function SistemaPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = use(params)
  const metrics = useSystemMetrics(tenant)
  const health = useHealth(tenant)
  const cron = useCronJobs(tenant)
  const errors = useErrorLogs(tenant)

  const uptime = health.data?.uptime ?? metrics.data?.uptime
  const memory = health.data?.memory ?? metrics.data?.memory
  const memPct = memory?.percent ?? (memory ? Math.round((memory.used / memory.total) * 100) : null)
  const isMetricsLoading = metrics.isLoading || health.isLoading

  return (
    <div className="space-y-6 py-6">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <h1 className="text-2xl font-bold">Sistema</h1>
        <p className="text-sm text-muted-foreground mt-1">Métricas de infraestrutura e jobs em background</p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.5 }} className="p-5 rounded-2xl border border-border bg-card">
          <div className="w-9 h-9 rounded-xl bg-sky-500/10 flex items-center justify-center mb-4"><Clock className="w-4 h-4 text-sky-400" aria-hidden="true" /></div>
          {isMetricsLoading ? <Skeleton className="h-7 w-24 mb-2" /> : <p className="text-xl font-bold text-foreground">{uptime ? formatUptime(uptime) : '—'}</p>}
          <p className="text-xs text-muted-foreground mt-1">Uptime da API</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.5 }} className="p-5 rounded-2xl border border-border bg-card">
          <div className="w-9 h-9 rounded-xl bg-purple-500/10 flex items-center justify-center mb-4"><HardDrive className="w-4 h-4 text-purple-400" aria-hidden="true" /></div>
          {isMetricsLoading ? <Skeleton className="h-7 w-24 mb-2" /> : <>
            <p className="text-xl font-bold text-foreground">{memPct !== null ? `${memPct}%` : '—'}</p>
            <p className="text-xs text-muted-foreground mt-1">Uso de memória</p>
            {memPct !== null && <div className="mt-3 h-1.5 rounded-full bg-accent overflow-hidden"><div className="h-full rounded-full bg-purple-500 transition-all duration-700" style={{ width: `${memPct}%` }} role="progressbar" aria-valuenow={memPct} aria-valuemin={0} aria-valuemax={100} /></div>}
          </>}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.5 }} className="p-5 rounded-2xl border border-border bg-card">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-4"><Activity className="w-4 h-4 text-emerald-400" aria-hidden="true" /></div>
          {metrics.isLoading ? <Skeleton className="h-7 w-24 mb-2" /> : <>
            <p className="text-xl font-bold text-foreground">{metrics.data?.requests?.total?.toLocaleString('pt-BR') ?? '—'}</p>
            <p className="text-xs text-muted-foreground mt-1">Total de requisições</p>
            {metrics.data?.requests && <p className="text-xs text-muted-foreground mt-0.5 opacity-70">{metrics.data.requests.errors} erros</p>}
          </>}
        </motion.div>
      </div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.5 }} className="p-5 rounded-2xl border border-border bg-card">
        <p className="text-sm font-semibold text-foreground mb-4">Cron Jobs</p>
        <CronJobsTable jobs={cron.data} loading={cron.isLoading} />
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.5 }} className="p-5 rounded-2xl border border-border bg-card">
        <p className="text-sm font-semibold text-foreground mb-4">Erros recentes</p>
        {errors.isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-xl" />)}</div>
        ) : !errors.data?.length ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><AlertCircle className="w-4 h-4" aria-hidden="true" />Nenhum erro recente</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border">
                <th className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">Pedido</th>
                <th className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">Mensagem</th>
                <th className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">Timestamp</th>
              </tr></thead>
              <tbody>
                {errors.data.slice(0, 10).map((e, i) => (
                  <tr key={i} className="border-b border-border hover:bg-accent/30 transition-colors">
                    <td className="py-2.5 px-3 font-mono text-xs text-sky-400">{e.orderId}</td>
                    <td className="py-2.5 px-3 text-xs text-red-400">{e.message}</td>
                    <td className="py-2.5 px-3 font-mono text-xs text-muted-foreground whitespace-nowrap">{formatDate(e.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  )
}
