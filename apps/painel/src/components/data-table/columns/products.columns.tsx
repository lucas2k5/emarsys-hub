import type { ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, truncate } from '@/lib/utils'
import type { Product } from '@/types/api'

export const productsColumns: ColumnDef<Product>[] = [
  {
    accessorKey: 'item',
    header: 'Item (SKU)',
    cell: ({ getValue }) => (
      <span className="font-mono text-xs text-sky-400 whitespace-nowrap">{getValue<string>()}</span>
    ),
  },
  {
    accessorKey: 'title',
    header: 'Título',
    cell: ({ getValue }) => (
      <span className="text-xs" title={getValue<string>()}>{truncate(getValue<string>(), 32)}</span>
    ),
  },
  {
    accessorKey: 'category',
    header: 'Categoria',
    cell: ({ getValue }) => (
      <span className="text-xs text-muted-foreground">{getValue<string>() ?? '—'}</span>
    ),
  },
  {
    accessorKey: 'available',
    header: 'Disponível',
    cell: ({ getValue }) => {
      const v = getValue<boolean | string | null>()
      const available = v === true || v === 'true' || v === '1' || v === 'yes'
      const unavailable = v === false || v === 'false' || v === '0' || v === 'no'
      if (!available && !unavailable) return <span className="text-xs text-muted-foreground">—</span>
      return (
        <Badge
          variant="outline"
          className={available
            ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
            : 'border-red-500/30 text-red-400 bg-red-500/10'}
        >
          {available ? 'Sim' : 'Não'}
        </Badge>
      )
    },
  },
  {
    accessorKey: 'price',
    header: 'Preço',
    cell: ({ getValue }) => (
      <span className="font-mono text-xs whitespace-nowrap">{formatCurrency(getValue<number | null>())}</span>
    ),
  },
  {
    accessorKey: 'msrp',
    header: 'MSRP',
    cell: ({ getValue }) => (
      <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">{formatCurrency(getValue<number | null>())}</span>
    ),
  },
  {
    accessorKey: 'c_stock',
    header: 'Estoque',
    cell: ({ getValue }) => {
      const v = getValue<number | null>()
      return (
        <span className={`font-mono text-xs ${v !== null && v <= 0 ? 'text-red-400' : v !== null && v <= 5 ? 'text-yellow-400' : 'text-foreground'}`}>
          {v ?? '—'}
        </span>
      )
    },
  },
  {
    accessorKey: 'c_sku_id',
    header: 'SKU ID',
    cell: ({ getValue }) => (
      <span className="font-mono text-xs text-muted-foreground">{getValue<string>() ?? '—'}</span>
    ),
  },
  {
    accessorKey: 'c_product_id',
    header: 'Product ID',
    cell: ({ getValue }) => (
      <span className="font-mono text-xs text-muted-foreground">{getValue<string>() ?? '—'}</span>
    ),
  },
  {
    accessorKey: 'group_id',
    header: 'Group ID',
    cell: ({ getValue }) => (
      <span className="font-mono text-xs text-muted-foreground">{getValue<string>() ?? '—'}</span>
    ),
  },
  {
    accessorKey: 'description',
    header: 'Descrição',
    cell: ({ getValue }) => (
      <span className="text-xs text-muted-foreground" title={getValue<string>() ?? ''}>{truncate(getValue<string>(), 40)}</span>
    ),
  },
  {
    accessorKey: 'link',
    header: 'Link',
    cell: ({ getValue }) => {
      const url = getValue<string | null>()
      if (!url) return <span className="text-xs text-muted-foreground">—</span>
      return (
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-400 hover:text-sky-300 transition-colors underline underline-offset-2">
          {truncate(url, 24)}
        </a>
      )
    },
  },
  {
    accessorKey: 'image',
    header: 'Imagem',
    cell: ({ getValue }) => {
      const url = getValue<string | null>()
      if (!url) return <span className="text-xs text-muted-foreground">—</span>
      return (
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-400 hover:text-sky-300 transition-colors underline underline-offset-2">
          ver
        </a>
      )
    },
  },
]
