'use client'
import { Badge } from '@/components/ui/badge'

export type SyncStatus = 'success' | 'running' | 'pending' | 'failed' | 'dead'

// Vocabulário ÚNICO de status do produto — mesma cor em qualquer tela
const STYLES: Record<SyncStatus, { cls: string; label: string }> = {
  success: { cls: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10', label: 'Sucesso' },
  running: { cls: 'border-highlight/30 text-highlight bg-highlight/10', label: 'Rodando' },
  pending: { cls: 'border-amber-500/30 text-amber-400 bg-amber-500/10', label: 'Pendente' },
  failed: { cls: 'border-rose-500/30 text-rose-400 bg-rose-500/10', label: 'Falhou' },
  dead: { cls: 'border-rose-500/40 text-rose-400 bg-rose-500/15', label: 'Dead-letter' },
}

export function StatusBadge({ status, label }: { status: SyncStatus | string; label?: string }) {
  const style = STYLES[status as SyncStatus] ?? STYLES.pending
  return (
    <Badge variant="outline" className={`${style.cls} text-xs`}>
      {label ?? style.label}
    </Badge>
  )
}
