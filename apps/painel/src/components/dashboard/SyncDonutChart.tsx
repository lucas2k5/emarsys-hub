'use client'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Skeleton } from '@/components/ui/skeleton'

const COLORS: Record<string, string> = {
  sent: '#22C55E',
  pending: '#F59E0B',
  failed: '#F43F5E',
  dead: '#E11D48',
}

type DataPoint = { name: string; value: number; key: string }

type Props = { data: DataPoint[]; loading?: boolean }

export function SyncDonutChart({ data, loading }: Props) {
  if (loading) return <Skeleton className="h-[220px] w-full rounded-2xl" />

  const filtered = data.filter(d => d.value > 0)

  if (!filtered.length) {
    return (
      <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
        Sem dados
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={filtered}
          cx="50%"
          cy="50%"
          innerRadius="55%"
          outerRadius="80%"
          paddingAngle={3}
          dataKey="value"
        >
          {filtered.map((entry) => (
            <Cell key={entry.key} fill={COLORS[entry.key] ?? '#7D8DB3'} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            background: '#0D0F17',
            border: '1px solid rgba(255,255,255,0.05)',
            borderRadius: 8,
            fontSize: 12,
          }}
          itemStyle={{ color: '#F8FAFC' }}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 11, color: '#7D8DB3' }}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
