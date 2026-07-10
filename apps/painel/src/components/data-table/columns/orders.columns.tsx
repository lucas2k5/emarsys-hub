import type { ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { formatDate, formatCurrency, truncate } from '@/lib/utils'
import type { Order } from '@/types/api'

export const ordersColumns: ColumnDef<Order>[] = [
  {
    accessorKey: 'order',
    header: 'Pedido',
    cell: ({ getValue }) => (
      <span className="font-mono text-xs text-sky-400 whitespace-nowrap">{getValue<string>()}</span>
    ),
  },
  {
    accessorKey: 'item',
    header: 'Item (SKU)',
    cell: ({ getValue }) => (
      <span className="font-mono text-xs text-muted-foreground">{getValue<string>()}</span>
    ),
  },
  {
    accessorKey: 'price',
    header: 'Preço',
    cell: ({ getValue }) => (
      <span className="font-mono text-xs whitespace-nowrap">{formatCurrency(getValue<number | null>())}</span>
    ),
  },
  {
    accessorKey: 'timestamp',
    header: 'Data',
    cell: ({ getValue }) => (
      <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">{formatDate(getValue<string>())}</span>
    ),
  },
  {
    accessorKey: 'customer',
    header: 'Customer',
    cell: ({ getValue }) => (
      <span className="font-mono text-xs text-muted-foreground" title={getValue<string>() ?? ''}>
        {truncate(getValue<string>(), 14)}
      </span>
    ),
  },
  {
    accessorKey: 'quantity',
    header: 'Qtd',
    cell: ({ getValue }) => (
      <span className="text-xs text-center block">{getValue<number | null>() ?? '—'}</span>
    ),
  },
  {
    accessorKey: 's_sales_channel',
    header: 'Sales Channel',
    cell: ({ getValue }) => (
      <span className="text-xs text-muted-foreground">{getValue<string>() ?? '—'}</span>
    ),
  },
  {
    accessorKey: 's_store_id',
    header: 'Store ID',
    cell: ({ getValue }) => (
      <span className="font-mono text-xs text-muted-foreground">{getValue<string>() ?? '—'}</span>
    ),
  },
  {
    accessorKey: 's_canal',
    header: 'Canal',
    cell: ({ getValue }) => (
      <span className="text-xs text-muted-foreground">{getValue<string>() ?? '—'}</span>
    ),
  },
  {
    accessorKey: 's_loja',
    header: 'Loja',
    cell: ({ getValue }) => {
      const v = getValue<string>() ?? ''
      if (!v) return <span className="text-xs text-muted-foreground">—</span>
      return (
        <Badge
          variant="outline"
          className={
            v.toLowerCase().includes('resort')
              ? 'border-purple-500/30 text-purple-400 bg-purple-500/10'
              : 'border-sky-500/30 text-sky-400 bg-sky-500/10'
          }
        >
          {v}
        </Badge>
      )
    },
  },
  {
    accessorKey: 's_tipo_pagamento',
    header: 'Pagamento',
    cell: ({ getValue }) => (
      <span className="text-xs text-muted-foreground">{getValue<string>() ?? '—'}</span>
    ),
  },
  {
    accessorKey: 's_cupom',
    header: 'Cupom',
    cell: ({ getValue }) => (
      <span className="font-mono text-xs text-muted-foreground">{getValue<string>() ?? '—'}</span>
    ),
  },
  {
    accessorKey: 'f_valor_desconto',
    header: 'Desconto',
    cell: ({ getValue }) => {
      const v = getValue<string | null>()
      if (!v) return <span className="text-xs text-muted-foreground">—</span>
      const num = parseFloat(v)
      return (
        <span className="font-mono text-xs text-orange-400">
          {isNaN(num) ? v : formatCurrency(num)}
        </span>
      )
    },
  },
  {
    accessorKey: 'isSync',
    header: 'Sincronização',
    cell: ({ getValue }) => {
      const v = getValue<boolean>()
      return (
        <Badge
          variant="outline"
          className={
            v
              ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
              : 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10'
          }
        >
          {v ? 'Sincronizado' : 'Pendente'}
        </Badge>
      )
    },
  },
]
