'use client'
import { use } from 'react'
import { motion } from 'framer-motion'
import { Package, AlertTriangle, CheckCircle2, Clock, ExternalLink, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { DataTable } from '@/components/data-table/DataTable'
import { productsColumns } from '@/components/data-table/columns/products.columns'
import { useProductStats } from '@/hooks/useProductStats'
import { useBackgroundJobs } from '@/hooks/useBackgroundJobs'
import { useProducts } from '@/hooks/useProducts'
import { formatDate, formatRelative } from '@/lib/utils'

const statusConfig = {
  ok: { label: 'Concluído', cls: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' },
  error: { label: 'Erro', cls: 'border-red-500/30 text-red-400 bg-red-500/10' },
  never: { label: 'Sem sincronização', cls: 'border-border text-muted-foreground' },
}

const jobStatusConfig: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  done: { label: 'Concluído', cls: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10', icon: <CheckCircle2 className="w-3 h-3" /> },
  running: { label: 'Em execução', cls: 'border-sky-500/30 text-sky-400 bg-sky-500/10', icon: <Loader2 className="w-3 h-3 animate-spin" /> },
  failed: { label: 'Falhou', cls: 'border-red-500/30 text-red-400 bg-red-500/10', icon: <AlertTriangle className="w-3 h-3" /> },
  pending: { label: 'Aguardando', cls: 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10', icon: <Clock className="w-3 h-3" /> },
}

export default function ProdutosPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = use(params)
  const { data: stats, isLoading: statsLoading } = useProductStats(tenant)
  const { data: jobs, isLoading: jobsLoading } = useBackgroundJobs(tenant)
  const { data: products, isLoading: productsLoading, error: productsError, refetch: refetchProducts } = useProducts(200, tenant)

  const productJobs = (jobs ?? []).filter(j => j.type?.toLowerCase().includes('product') || j.type?.toLowerCase().includes('catalog'))

  return (
    <div className="space-y-6 py-6">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <h1 className="text-2xl font-bold">Produtos</h1>
        <p className="text-sm text-muted-foreground mt-1">Sincronização de catálogo VTEX → SAP Emarsys via SFTP</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.5 }} className="p-5 rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between mb-5">
          <p className="text-sm font-semibold text-foreground">Status da sincronização</p>
          <Button variant="outline" size="sm" className="border-border hover:border-border/60 text-xs h-8" onClick={() => window.open('https://suite.emarsys.net', '_blank')}>
            <ExternalLink className="w-3 h-3 mr-1.5" /> Ver no Emarsys
          </Button>
        </div>
        {statsLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
        ) : !stats ? (
          <p className="text-sm text-muted-foreground">Dados não disponíveis</p>
        ) : (
          <>
            {stats.status === 'error' && <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20"><AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" /><p className="text-sm text-red-400">Erro na última sincronização</p></div>}
            {stats.status === 'never' && <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-xl bg-accent border border-border"><Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" /><p className="text-sm text-muted-foreground">Nenhuma sincronização realizada ainda</p></div>}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-accent border border-border"><p className="text-xs text-muted-foreground mb-1">Status</p><Badge variant="outline" className={statusConfig[stats.status].cls}>{statusConfig[stats.status].label}</Badge></div>
              <div className="p-4 rounded-xl bg-accent border border-border"><p className="text-xs text-muted-foreground mb-1">Total SKUs</p><p className="text-xl font-bold text-foreground flex items-center gap-2"><Package className="w-4 h-4 text-purple-400" />{stats.total?.toLocaleString('pt-BR') ?? '—'}</p></div>
              <div className="p-4 rounded-xl bg-accent border border-border"><p className="text-xs text-muted-foreground mb-1">Última sincronização</p><p className="font-mono text-xs text-foreground">{formatDate(stats.lastSync)}</p>{stats.lastSync && <p className="text-xs text-muted-foreground mt-0.5">{formatRelative(stats.lastSync)}</p>}</div>
              <div className="p-4 rounded-xl bg-accent border border-border"><p className="text-xs text-muted-foreground mb-1">Último arquivo</p><p className="font-mono text-xs text-foreground break-all">{stats.lastFile ?? '—'}</p></div>
            </div>
          </>
        )}
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.5 }} className="p-5 rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-foreground">Catálogo de produtos</p>
          {products && <Badge variant="outline" className="border-border text-muted-foreground text-xs">{products.length.toLocaleString('pt-BR')} SKUs</Badge>}
        </div>
        <DataTable columns={productsColumns} data={products ?? []} isLoading={productsLoading} error={productsError} onRetry={refetchProducts} />
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.5 }} className="p-5 rounded-2xl border border-border bg-card">
        <p className="text-sm font-semibold text-foreground mb-4">Jobs em background</p>
        {jobsLoading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-xl" />)}</div>
        ) : !productJobs.length ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <Clock className="w-8 h-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nenhum job registrado</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-accent/30"><tr className="border-b border-border">
                <th className="text-left py-3 px-4 text-xs text-muted-foreground font-medium">ID</th>
                <th className="text-left py-3 px-4 text-xs text-muted-foreground font-medium">Tipo</th>
                <th className="text-left py-3 px-4 text-xs text-muted-foreground font-medium">Status</th>
                <th className="text-left py-3 px-4 text-xs text-muted-foreground font-medium">Iniciado em</th>
                <th className="text-left py-3 px-4 text-xs text-muted-foreground font-medium">Progresso</th>
              </tr></thead>
              <tbody>
                {productJobs.map(job => {
                  const s = jobStatusConfig[job.status] ?? jobStatusConfig.pending
                  return (
                    <tr key={job.id} className="border-b border-border hover:bg-accent/30 transition-colors">
                      <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{job.id}</td>
                      <td className="py-3 px-4 text-xs text-foreground">{job.type}</td>
                      <td className="py-3 px-4"><Badge variant="outline" className={`${s.cls} flex items-center gap-1 w-fit`}>{s.icon}{s.label}</Badge></td>
                      <td className="py-3 px-4 font-mono text-xs text-muted-foreground whitespace-nowrap">{formatDate(job.startedAt)}</td>
                      <td className="py-3 px-4">{job.progress !== undefined ? <div className="flex items-center gap-2"><div className="h-1.5 w-20 rounded-full bg-accent overflow-hidden"><div className="h-full rounded-full bg-sky-500 transition-all duration-700" style={{ width: `${job.progress}%` }} /></div><span className="text-xs text-muted-foreground">{job.progress}%</span></div> : <span className="text-xs text-muted-foreground">—</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  )
}
