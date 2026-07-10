'use client'
import { motion } from 'framer-motion'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type MetricCardProps = {
  title: string
  value: string | number
  sub?: string
  icon: React.ReactNode
  iconBg?: string
  loading?: boolean
  index?: number
}

export function MetricCard({
  title,
  value,
  sub,
  icon,
  iconBg = 'bg-primary/10',
  loading,
  index = 0,
}: MetricCardProps) {
  if (loading) {
    return (
      <div className="p-4 lg:p-5 rounded-2xl border border-border bg-card">
        <Skeleton className="h-9 w-9 rounded-xl mb-4" />
        <Skeleton className="h-7 w-24 mb-2" />
        <Skeleton className="h-4 w-32" />
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.5 }}
      className="p-4 lg:p-5 rounded-2xl border border-border bg-card hover:border-border transition-all duration-200"
    >
      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center mb-4', iconBg)}>
        {icon}
      </div>
      <p className="text-xl lg:text-2xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{title}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5 opacity-70">{sub}</p>}
    </motion.div>
  )
}
