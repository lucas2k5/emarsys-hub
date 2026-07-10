import type { ColumnDef } from '@tanstack/react-table'
import { clientTypeBadgeClass, clientTypeLabel } from '@/lib/clientTypeBadge'
import { Badge } from '@/components/ui/badge'
import { formatDate, truncate } from '@/lib/utils'
import type { Contact, ContactStatus } from '@/types/api'

const statusColor: Record<ContactStatus, string> = {
  sent:    'border-emerald-500/30 text-emerald-400 bg-emerald-500/10',
  pending: 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10',
  failed:  'border-orange-500/30 text-orange-400 bg-orange-500/10',
  dead:    'border-red-500/30 text-red-400 bg-red-500/10',
}

export const contactsColumns: ColumnDef<Contact>[] = [
  {
    accessorKey: 'customer_id',
    header: 'Customer ID',
    cell: ({ getValue }) => (
      <span className="font-mono text-xs text-muted-foreground">{truncate(getValue<string>(), 18)}</span>
    ),
  },
  {
    accessorKey: 'client_type',
    header: 'Tipo',
    cell: ({ getValue }) => {
      const v = getValue<string>()
      return (
        <Badge variant="outline" className={clientTypeBadgeClass(v)}>
          {clientTypeLabel(v)}
        </Badge>
      )
    },
  },
  {
    accessorKey: 'email',
    header: 'Email',
    cell: ({ getValue }) => (
      <span className="text-xs" title={getValue<string>() ?? ''}>{truncate(getValue<string>(), 28)}</span>
    ),
  },
  {
    accessorKey: 'first_name',
    header: 'Nome',
    cell: ({ row }) => {
      const first = row.original.first_name
      const last = row.original.last_name
      const name = [first, last].filter(Boolean).join(' ')
      return <span className="text-xs text-muted-foreground">{name || '—'}</span>
    },
  },
  {
    accessorKey: 'phone',
    header: 'Telefone',
    cell: ({ row }) => {
      const phone = row.original.phone ?? row.original.mobile
      return <span className="font-mono text-xs text-muted-foreground">{phone ?? '—'}</span>
    },
  },
  {
    accessorKey: 'country',
    header: 'País',
    cell: ({ getValue }) => (
      <span className="text-xs text-muted-foreground">{getValue<string>() ?? '—'}</span>
    ),
  },
  {
    accessorKey: 'opt_in',
    header: 'Opt-in',
    cell: ({ getValue }) => {
      const v = getValue<boolean | null>()
      if (v === null || v === undefined) return <span className="text-xs text-muted-foreground">—</span>
      return (
        <Badge
          variant="outline"
          className={v ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' : 'border-border text-muted-foreground'}
        >
          {v ? 'Sim' : 'Não'}
        </Badge>
      )
    },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }) => {
      const v = getValue<ContactStatus>()
      return <Badge variant="outline" className={statusColor[v]}>{v}</Badge>
    },
  },
  {
    accessorKey: 'attempts',
    header: 'Tent.',
    cell: ({ getValue }) => (
      <span className="font-mono text-xs text-center block">{getValue<number>()}</span>
    ),
  },
  {
    accessorKey: 'last_error',
    header: 'Último erro',
    cell: ({ getValue }) => {
      const v = getValue<string | null>()
      return <span className="text-xs text-muted-foreground" title={v ?? ''}>{truncate(v, 36)}</span>
    },
  },
  {
    accessorKey: 'created_at',
    header: 'Criado em',
    cell: ({ getValue }) => (
      <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">{formatDate(getValue<string>())}</span>
    ),
  },
]
