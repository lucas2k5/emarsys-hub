'use client'
import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

/** Container padrão de gráficos/listas do dashboard (identidade da referência). */
export function ChartCard({
  title,
  subtitle,
  action,
  children,
  delay = 0.1,
  className = '',
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
  delay?: number
  className?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5 }}
      className={`p-5 rounded-2xl border border-border bg-card ${className}`}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </motion.div>
  )
}
