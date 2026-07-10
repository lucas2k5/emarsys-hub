'use client'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
} from '@tanstack/react-table'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Inbox, AlertCircle } from 'lucide-react'

type DataTableProps<T> = {
  columns: ColumnDef<T>[]
  data: T[]
  total?: number
  isLoading?: boolean
  error?: Error | null
  pagination?: PaginationState
  onPaginationChange?: (p: PaginationState) => void
  onRetry?: () => void
}

export function DataTable<T>({
  columns,
  data,
  total,
  isLoading,
  error,
  pagination,
  onPaginationChange,
  onRetry,
}: DataTableProps<T>) {
  const pageCount =
    total && pagination ? Math.ceil(total / pagination.pageSize) : undefined

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount,
    state: { pagination },
    onPaginationChange: (updater) => {
      if (!onPaginationChange || !pagination) return
      const next =
        typeof updater === 'function' ? updater(pagination) : updater
      onPaginationChange(next)
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <AlertCircle className="w-5 h-5 text-red-400" aria-hidden="true" />
        </div>
        <p className="text-sm text-muted-foreground">{error.message}</p>
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="mt-2 border-border hover:border-border/60"
          >
            Tentar novamente
          </Button>
        )}
      </div>
    )
  }

  if (!data.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <div className="w-12 h-12 rounded-2xl bg-accent border border-border flex items-center justify-center">
          <Inbox className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
        </div>
        <p className="text-sm text-muted-foreground">Nenhum dado encontrado</p>
        <p className="text-xs text-muted-foreground opacity-60">Tente ajustar os filtros</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-accent/30">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-border">
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className="text-left py-3 px-4 text-xs text-muted-foreground font-medium whitespace-nowrap"
                  >
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-border hover:bg-accent/30 transition-colors"
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="py-3 px-4 text-sm">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination && onPaginationChange && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {total !== undefined &&
              `Exibindo ${pagination.pageIndex * pagination.pageSize + 1}–${Math.min(
                (pagination.pageIndex + 1) * pagination.pageSize,
                total
              )} de ${total}`}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="w-7 h-7 border-border hover:border-border/60"
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
              aria-label="Página anterior"
            >
              <ChevronLeft className="w-3 h-3" />
            </Button>
            <span>
              Pág. {pagination.pageIndex + 1} de {pageCount ?? '?'}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="w-7 h-7 border-border hover:border-border/60"
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
              aria-label="Próxima página"
            >
              <ChevronRight className="w-3 h-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
