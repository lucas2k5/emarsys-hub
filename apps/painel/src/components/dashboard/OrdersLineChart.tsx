'use client'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Skeleton } from '@/components/ui/skeleton'

type DataPoint = { date: string; total: number; synced: number }

type Props = { data: DataPoint[]; loading?: boolean }

export function OrdersLineChart({ data, loading }: Props) {
  if (loading) return <Skeleton className="h-[220px] w-full rounded-2xl" />

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: '#7D8DB3' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#7D8DB3' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            background: '#0D0F17',
            border: '1px solid rgba(255,255,255,0.05)',
            borderRadius: 8,
            fontSize: 12,
          }}
          itemStyle={{ color: '#F8FAFC' }}
        />
        <Line
          type="monotone"
          dataKey="total"
          stroke="#0066FF"
          strokeWidth={2}
          dot={false}
          name="Total"
        />
        <Line
          type="monotone"
          dataKey="synced"
          stroke="#00D4FF"
          strokeWidth={2}
          dot={false}
          name="Sincronizados"
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
