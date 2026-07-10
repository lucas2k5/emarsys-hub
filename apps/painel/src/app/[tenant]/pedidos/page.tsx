'use client'
import { use, useState } from 'react'
import { motion } from 'framer-motion'
import { Download, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/data-table/DataTable'
import { ordersColumns } from '@/components/data-table/columns/orders.columns'
import { useOrders } from '@/hooks/useOrders'
import { exportToCSV } from '@/lib/export'
import { getDateRange, type DatePeriod } from '@/lib/utils'
import type { OrderFilters } from '@/types/api'
import type { PaginationState } from '@tanstack/react-table'

const periodLabels: Record<DatePeriod, string> = {
  all: 'Todo período',
  day: 'Hoje',
  week: 'Última semana',
  month: 'Último mês',
}

export default function PedidosPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = use(params)
  const [filters, setFilters] = useState<OrderFilters>({})
  const [period, setPeriod] = useState<DatePeriod>('all')
  const [emailInput, setEmailInput] = useState('')
  const [customerInput, setCustomerInput] = useState('')
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 50 })

  const dateRange = getDateRange(period)

  const { data, isLoading, error, refetch } = useOrders({
    ...filters,
    ...dateRange,
    limit: pagination.pageSize,
    offset: pagination.pageIndex * pagination.pageSize,
  }, tenant)

  function setFilter<K extends keyof OrderFilters>(key: K, value: OrderFilters[K]) {
    setFilters(prev => ({ ...prev, [key]: value }))
    setPagination(prev => ({ ...prev, pageIndex: 0 }))
  }

  function clearFilter<K extends keyof OrderFilters>(key: K) {
    setFilters(prev => { const n = { ...prev }; delete n[key]; return n })
    setPagination(prev => ({ ...prev, pageIndex: 0 }))
  }

  function applyEmail() { if (emailInput.trim()) setFilter('email', emailInput.trim()); else clearFilter('email') }
  function applyCustomer() { if (customerInput.trim()) setFilter('customer_id', customerInput.trim()); else clearFilter('customer_id') }

  function clearAll() {
    setFilters({})
    setPeriod('all')
    setEmailInput('')
    setCustomerInput('')
    setPagination(prev => ({ ...prev, pageIndex: 0 }))
  }

  const hasActiveFilters = Object.keys(filters).length > 0 || period !== 'all'

  return (
    <div className="space-y-6 py-6">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <h1 className="text-2xl font-bold">Pedidos</h1>
        <p className="text-sm text-muted-foreground mt-1">Itens de pedido integrados — VTEX → Emarsys</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.5 }} className="p-4 rounded-2xl border border-border bg-card space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <Select value={period} onValueChange={v => { setPeriod(v as DatePeriod); setPagination(p => ({ ...p, pageIndex: 0 })) }}>
            <SelectTrigger className="w-40 border-border bg-accent text-sm h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{(Object.keys(periodLabels) as DatePeriod[]).map(p => <SelectItem key={p} value={p}>{periodLabels[p]}</SelectItem>)}</SelectContent>
          </Select>
          <Select onValueChange={v => v === 'all' ? clearFilter('isSync') : setFilter('isSync', v === 'true')}>
            <SelectTrigger className="w-44 border-border bg-accent text-sm h-9"><SelectValue placeholder="Sincronização" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="true">Sincronizados</SelectItem>
              <SelectItem value="false">Pendentes</SelectItem>
            </SelectContent>
          </Select>
          <Select onValueChange={v => v === 'all' ? clearFilter('order_status') : setFilter('order_status', v)}>
            <SelectTrigger className="w-44 border-border bg-accent text-sm h-9"><SelectValue placeholder="Status VTEX" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="invoiced">Faturado</SelectItem>
              <SelectItem value="canceled">Cancelado</SelectItem>
              <SelectItem value="payment-approved">Pag. aprovado</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="Loja..." className="w-36 border-border bg-accent text-sm h-9" onChange={e => { const v = e.target.value.trim(); if (v) setFilter('s_loja', v); else clearFilter('s_loja') }} />
          <Select onValueChange={v => v === 'all' ? clearFilter('s_canal') : setFilter('s_canal', v)}>
            <SelectTrigger className="w-48 border-border bg-accent text-sm h-9"><SelectValue placeholder="Canal" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="Conta Principal">Conta Principal</SelectItem>
              <SelectItem value="TikTok">TikTok</SelectItem>
              <SelectItem value="APP">APP</SelectItem>
              <SelectItem value="Mercado Livre">Mercado Livre</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex gap-2">
            <Input placeholder="Buscar por email..." value={emailInput} onChange={e => setEmailInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && applyEmail()} className="w-52 border-border bg-accent text-sm h-9" />
            <Button size="sm" variant="outline" className="h-9 border-border hover:border-border/60 px-3" onClick={applyEmail} aria-label="Buscar por email"><Search className="w-3.5 h-3.5" /></Button>
          </div>
          <div className="flex gap-2">
            <Input placeholder="Customer ID..." value={customerInput} onChange={e => setCustomerInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && applyCustomer()} className="w-48 border-border bg-accent text-sm h-9 font-mono" />
            <Button size="sm" variant="outline" className="h-9 border-border hover:border-border/60 px-3" onClick={applyCustomer} aria-label="Buscar por customer ID"><Search className="w-3.5 h-3.5" /></Button>
          </div>
          {hasActiveFilters && (
            <Button size="sm" variant="outline" className="h-9 border-border hover:border-red-500/30 hover:text-red-400 text-muted-foreground gap-1.5" onClick={clearAll}>
              <X className="w-3 h-3" /> Limpar filtros
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-9 border-border hover:border-border/60 ml-auto"
            onClick={() => data?.orders && exportToCSV(data.orders as unknown as Record<string, unknown>[], 'pedidos', [
              { key: 'order', label: 'Pedido' }, { key: 'item', label: 'SKU' }, { key: 'email', label: 'Email' },
              { key: 'customer', label: 'Customer ID' }, { key: 'quantity', label: 'Qtd' }, { key: 'price', label: 'Preço' },
              { key: 'isSync', label: 'Sincronização' }, { key: 'order_status', label: 'Status' },
              { key: 's_loja', label: 'Loja' }, { key: 's_canal', label: 'Canal' }, { key: 'timestamp', label: 'Data' },
            ])}>
            <Download className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Exportar CSV
          </Button>
        </div>

        {hasActiveFilters && (
          <div className="flex flex-wrap gap-2 pt-1">
            {period !== 'all' && (
              <Badge variant="outline" className="border-sky-500/30 text-sky-400 bg-sky-500/10 gap-1 text-xs">
                {periodLabels[period]}
                <button onClick={() => { setPeriod('all'); setPagination(p => ({ ...p, pageIndex: 0 })) }} aria-label="Remover filtro de período"><X className="w-3 h-3" /></button>
              </Badge>
            )}
            {filters.email && (
              <Badge variant="outline" className="border-border/60 text-muted-foreground gap-1 text-xs">
                Email: {filters.email}
                <button onClick={() => { clearFilter('email'); setEmailInput('') }} aria-label="Remover filtro de email"><X className="w-3 h-3" /></button>
              </Badge>
            )}
            {filters.customer_id && (
              <Badge variant="outline" className="border-border/60 text-muted-foreground gap-1 text-xs font-mono">
                Customer: {filters.customer_id}
                <button onClick={() => { clearFilter('customer_id'); setCustomerInput('') }} aria-label="Remover filtro de customer"><X className="w-3 h-3" /></button>
              </Badge>
            )}
          </div>
        )}
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.5 }} className="p-5 rounded-2xl border border-border bg-card">
        <DataTable columns={ordersColumns} data={data?.orders ?? []} total={data?.total} isLoading={isLoading} error={error} pagination={pagination} onPaginationChange={setPagination} onRetry={refetch} />
      </motion.div>
    </div>
  )
}
