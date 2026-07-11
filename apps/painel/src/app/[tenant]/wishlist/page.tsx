'use client'
import { use } from 'react'
import { motion } from 'framer-motion'
import { Heart, CalendarClock, CheckCircle2, AlertCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useWishlist } from '@/hooks/useWishlist'
import { formatDate } from '@/lib/utils'

const RUN_STATUS_STYLE: Record<string, string> = {
  completed: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10',
  running: 'border-sky-500/30 text-sky-400 bg-sky-500/10',
  failed: 'border-red-500/30 text-red-400 bg-red-500/10',
}

const RUN_STATUS_LABEL: Record<string, string> = {
  completed: 'concluída',
  running: 'rodando',
  failed: 'falhou',
}

export default function WishlistPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = use(params)
  const { data, isLoading } = useWishlist(tenant)

  const environments = data?.environments ?? []
  const runs = data?.runs ?? []
  const lastOk = runs.find(r => r.status === 'completed')
  const totalSentRecent = runs.reduce((acc, r) => acc + (r.stats?.sent ?? 0), 0)
  const totalErrorsRecent = runs.reduce((acc, r) => acc + (r.stats?.errors ?? 0) + (r.status === 'failed' ? 1 : 0), 0)

  return (
    <div className="space-y-6 py-6">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <h1 className="text-2xl font-bold">Wishlist</h1>
        <p className="text-sm text-muted-foreground mt-1">Sincronização incremental de listas de desejo VTEX → Emarsys</p>
      </motion.div>

      {/* Métricas gerais */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.5 }} className="p-5 rounded-2xl border border-border bg-card">
          <div className="w-9 h-9 rounded-xl bg-pink-500/10 flex items-center justify-center mb-4"><Heart className="w-4 h-4 text-pink-400" aria-hidden="true" /></div>
          {isLoading ? <Skeleton className="h-7 w-24 mb-2" /> : <p className="text-xl font-bold text-foreground">{totalSentRecent.toLocaleString('pt-BR')}</p>}
          <p className="text-xs text-muted-foreground mt-1">Wishlists enviadas (últimas execuções)</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.5 }} className="p-5 rounded-2xl border border-border bg-card">
          <div className="w-9 h-9 rounded-xl bg-sky-500/10 flex items-center justify-center mb-4"><CalendarClock className="w-4 h-4 text-sky-400" aria-hidden="true" /></div>
          {isLoading ? <Skeleton className="h-7 w-24 mb-2" /> : <p className="text-xl font-bold text-foreground">{lastOk ? formatDate(lastOk.startedAt) : '—'}</p>}
          <p className="text-xs text-muted-foreground mt-1">Última sincronização concluída</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.5 }} className="p-5 rounded-2xl border border-border bg-card">
          <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center mb-4"><AlertCircle className="w-4 h-4 text-red-400" aria-hidden="true" /></div>
          {isLoading ? <Skeleton className="h-7 w-24 mb-2" /> : <p className="text-xl font-bold text-foreground">{totalErrorsRecent.toLocaleString('pt-BR')}</p>}
          <p className="text-xs text-muted-foreground mt-1">Erros (últimas execuções)</p>
        </motion.div>
      </div>

      {/* Status por ambiente */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.5 }} className="p-5 rounded-2xl border border-border bg-card">
        <p className="text-sm font-semibold text-foreground mb-4">Status por ambiente</p>
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
        ) : environments.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">Nenhum ambiente encontrado para este cliente.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {environments.map(env => (
              <div key={env.environmentId} className="p-4 rounded-xl border border-border bg-accent/20 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">{env.envName}</p>
                  <Badge variant="outline" className={env.enabled ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' : 'border-border text-muted-foreground'}>
                    {env.enabled ? 'Automação ativa' : 'Automação inativa'}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>Checkpoint incremental: <span className="font-mono">{env.checkpoint ? formatDate(env.checkpoint) : 'primeira execução pendente'}</span></p>
                  <p>Última execução: {env.lastRunAt ? formatDate(env.lastRunAt) : '—'}
                    {env.lastStatus && (
                      <span className={env.lastStatus === 'success' ? ' text-emerald-400' : ' text-red-400'}>
                        {' '}({env.lastStatus === 'success' ? 'sucesso' : 'erro'})
                      </span>
                    )}
                  </p>
                  {env.cronExpression && <p>Agenda: <span className="font-mono">{env.cronExpression}</span></p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Histórico de execuções */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.5 }} className="p-5 rounded-2xl border border-border bg-card">
        <p className="text-sm font-semibold text-foreground mb-4">Execuções recentes</p>
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full rounded-lg" />)}</div>
        ) : runs.length === 0 ? (
          <div className="py-8 text-center space-y-2">
            <CheckCircle2 className="w-8 h-8 text-muted-foreground/40 mx-auto" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Nenhuma execução ainda — ative a automação de Wishlist do ambiente em Clientes → Automações.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 px-2 font-medium">Início</th>
                  <th className="py-2 px-2 font-medium">Ambiente</th>
                  <th className="py-2 px-2 font-medium">Status</th>
                  <th className="py-2 px-2 font-medium text-right">Coletadas</th>
                  <th className="py-2 px-2 font-medium text-right">Enviadas</th>
                  <th className="py-2 px-2 font-medium text-right">Erros</th>
                  <th className="py-2 px-2 font-medium">Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {runs.map(run => (
                  <tr key={run.id} className="border-b border-border/50">
                    <td className="py-2 px-2 whitespace-nowrap">{formatDate(run.startedAt)}</td>
                    <td className="py-2 px-2">{run.envSlug}</td>
                    <td className="py-2 px-2">
                      <Badge variant="outline" className={RUN_STATUS_STYLE[run.status] ?? ''}>
                        {RUN_STATUS_LABEL[run.status] ?? run.status}{run.stats?.debug ? ' · debug' : ''}
                      </Badge>
                    </td>
                    <td className="py-2 px-2 text-right font-mono">{run.stats?.collected ?? '—'}</td>
                    <td className="py-2 px-2 text-right font-mono">{run.stats?.sent ?? '—'}</td>
                    <td className="py-2 px-2 text-right font-mono">{run.stats?.errors ?? (run.status === 'failed' ? 1 : 0)}</td>
                    <td className="py-2 px-2 text-muted-foreground max-w-64 truncate" title={run.error ?? ''}>{run.error ?? '—'}</td>
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
