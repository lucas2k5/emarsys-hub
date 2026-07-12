'use client'
import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

export type KpiTone = 'primary' | 'highlight' | 'violet' | 'rose' | 'emerald' | 'amber'

// Classes estáticas por tom (Tailwind não resolve interpolação dinâmica)
const TONES: Record<KpiTone, { chip: string; icon: string }> = {
  primary: { chip: 'bg-primary/10 border-primary/20', icon: 'text-primary' },
  highlight: { chip: 'bg-highlight/10 border-highlight/20', icon: 'text-highlight' },
  violet: { chip: 'bg-violet-500/10 border-violet-500/20', icon: 'text-violet-400' },
  rose: { chip: 'bg-rose-500/10 border-rose-500/20', icon: 'text-rose-400' },
  emerald: { chip: 'bg-emerald-500/10 border-emerald-500/20', icon: 'text-emerald-400' },
  amber: { chip: 'bg-amber-500/10 border-amber-500/20', icon: 'text-amber-400' },
}

export function KpiCard({
  title,
  value,
  sub,
  subTone = 'muted',
  icon: Icon,
  tone = 'primary',
  index = 0,
  loading,
}: {
  title: string
  value: string | number
  sub?: string
  subTone?: 'muted' | 'positive' | 'negative' | 'warning'
  icon: LucideIcon
  tone?: KpiTone
  index?: number
  loading?: boolean
}) {
  const t = TONES[tone]
  const subCls =
    subTone === 'positive' ? 'text-emerald-400'
    : subTone === 'negative' ? 'text-rose-400'
    : subTone === 'warning' ? 'text-amber-400'
    : 'text-muted-foreground'

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 + index * 0.05, duration: 0.4 }}
      className="p-5 rounded-2xl border border-border bg-card"
    >
      <div className={`w-9 h-9 rounded-xl border flex items-center justify-center mb-4 ${t.chip}`}>
        <Icon className={`w-4 h-4 ${t.icon}`} aria-hidden="true" />
      </div>
      {loading ? (
        <Skeleton className="h-8 w-24 mb-1" />
      ) : (
        <p className="text-2xl font-bold text-foreground leading-tight">{value}</p>
      )}
      <p className="text-xs text-muted-foreground mt-1">{title}</p>
      {sub && !loading && <p className={`text-xs mt-1 ${subCls}`}>{sub}</p>}
    </motion.div>
  )
}
