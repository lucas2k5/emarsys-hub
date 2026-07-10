'use client'
import { use, useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Search, X } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DataTable } from '@/components/data-table/DataTable'
import { contactsColumns } from '@/components/data-table/columns/contacts.columns'
import { useContacts } from '@/hooks/useContacts'
import { useContactsStats } from '@/hooks/useContactsStats'
import { getDateRange, type DatePeriod } from '@/lib/utils'
import type { Contact, ContactStatus } from '@/types/api'
import type { ColumnDef, CellContext } from '@tanstack/react-table'

const periodLabels: Record<DatePeriod, string> = {
  all: 'Todo período', day: 'Hoje', week: 'Última semana', month: 'Último mês',
}

export default function ContatosPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = use(params)
  const [statusFilter, setStatusFilter] = useState<ContactStatus | 'all'>('all')
  const [typeInput, setTypeInput] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [period, setPeriod] = useState<DatePeriod>('all')
  const [customerInput, setCustomerInput] = useState('')
  const [customerFilter, setCustomerFilter] = useState('')
  const [emailInput, setEmailInput] = useState('')
  const [emailFilter, setEmailFilter] = useState('')
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const { data: contacts, isLoading, error, refetch } = useContacts(200, tenant)
  const { data: stats } = useContactsStats(tenant)

  const { startDate, endDate } = getDateRange(period)

  const filtered = useMemo(() => {
    return (contacts ?? []).filter(c => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false
      if (typeFilter && !(c.client_type ?? '').toLowerCase().includes(typeFilter.toLowerCase())) return false
      if (customerFilter && !(c.customer_id ?? '').toLowerCase().includes(customerFilter.toLowerCase())) return false
      if (emailFilter && !(c.email ?? '').toLowerCase().includes(emailFilter.toLowerCase())) return false
      if (startDate && new Date(c.created_at) < new Date(startDate)) return false
      if (endDate && new Date(c.created_at) > new Date(endDate)) return false
      return true
    })
  }, [contacts, statusFilter, typeFilter, customerFilter, emailFilter, startDate, endDate])

  const hasActiveFilters = statusFilter !== 'all' || !!typeFilter || period !== 'all' || !!customerFilter || !!emailFilter

  function clearAll() {
    setStatusFilter('all'); setTypeInput(''); setTypeFilter(''); setPeriod('all')
    setCustomerInput(''); setCustomerFilter(''); setEmailInput(''); setEmailFilter('')
  }

  const pills = [
    { label: 'Enviados', value: stats?.sent ?? 0, cls: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' },
    { label: 'Pendentes', value: stats?.pending ?? 0, cls: 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10' },
    { label: 'Falhos', value: stats?.failed ?? 0, cls: 'border-orange-500/30 text-orange-400 bg-orange-500/10' },
    { label: 'Mortos', value: stats?.dead ?? 0, cls: 'border-red-500/30 text-red-400 bg-red-500/10' },
  ]

  const columnsWithClick: ColumnDef<Contact>[] = contactsColumns.map(col => ({
    ...col,
    cell: (ctx: CellContext<Contact, unknown>) => {
      const row = ctx.row.original
      const original = col.cell
      return (
        <div className="cursor-pointer" onClick={() => { setSelectedContact(row); setSheetOpen(true) }}>
          {typeof original === 'function' ? original(ctx) : null}
        </div>
      )
    },
  }))

  let parsedPayload = ''
  if (selectedContact?.payload) {
    try { parsedPayload = JSON.stringify(JSON.parse(selectedContact.payload), null, 2) }
    catch { parsedPayload = selectedContact.payload }
  }

  return (
    <div className="space-y-6 py-6">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <h1 className="text-2xl font-bold">Contatos</h1>
        <p className="text-sm text-muted-foreground mt-1">Clientes processados pelo conector Emarsys</p>
      </motion.div>

      <div className="flex flex-wrap gap-2">
        {pills.map(p => <Badge key={p.label} variant="outline" className={p.cls}>{p.label}: {p.value.toLocaleString('pt-BR')}</Badge>)}
        {filtered.length !== (contacts?.length ?? 0) && <Badge variant="outline" className="border-border/60 text-muted-foreground">{filtered.length.toLocaleString('pt-BR')} exibidos</Badge>}
      </div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.5 }} className="p-4 rounded-2xl border border-border bg-card space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <Select value={period} onValueChange={v => setPeriod(v as DatePeriod)}>
            <SelectTrigger className="w-40 border-border bg-accent text-sm h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{(Object.keys(periodLabels) as DatePeriod[]).map(p => <SelectItem key={p} value={p}>{periodLabels[p]}</SelectItem>)}</SelectContent>
          </Select>
          <Select onValueChange={v => setStatusFilter(v as ContactStatus | 'all')}>
            <SelectTrigger className="w-40 border-border bg-accent text-sm h-9"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="sent">Enviados</SelectItem>
              <SelectItem value="pending">Pendentes</SelectItem>
              <SelectItem value="failed">Falhos</SelectItem>
              <SelectItem value="dead">Mortos</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Input placeholder="Tipo..." value={typeInput} onChange={e => setTypeInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') setTypeFilter(typeInput.trim()) }} className="w-48 border-border bg-accent text-sm h-9" />
            <Button size="sm" variant="outline" className="h-9 border-border hover:border-border/60 px-3" onClick={() => setTypeFilter(typeInput.trim())} aria-label="Filtrar por tipo"><Search className="w-3.5 h-3.5" /></Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex gap-2">
            <Input placeholder="Buscar por email..." value={emailInput} onChange={e => setEmailInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') setEmailFilter(emailInput.trim()) }} className="w-52 border-border bg-accent text-sm h-9" />
            <Button size="sm" variant="outline" className="h-9 border-border hover:border-border/60 px-3" onClick={() => setEmailFilter(emailInput.trim())} aria-label="Filtrar por email"><Search className="w-3.5 h-3.5" /></Button>
          </div>
          <div className="flex gap-2">
            <Input placeholder="Customer ID..." value={customerInput} onChange={e => setCustomerInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') setCustomerFilter(customerInput.trim()) }} className="w-48 border-border bg-accent text-sm h-9 font-mono" />
            <Button size="sm" variant="outline" className="h-9 border-border hover:border-border/60 px-3" onClick={() => setCustomerFilter(customerInput.trim())} aria-label="Filtrar por customer ID"><Search className="w-3.5 h-3.5" /></Button>
          </div>
          {hasActiveFilters && <Button size="sm" variant="outline" className="h-9 border-border hover:border-red-500/30 hover:text-red-400 text-muted-foreground gap-1.5" onClick={clearAll}><X className="w-3 h-3" /> Limpar filtros</Button>}
        </div>
        {hasActiveFilters && (
          <div className="flex flex-wrap gap-2 pt-1">
            {period !== 'all' && <Badge variant="outline" className="border-sky-500/30 text-sky-400 bg-sky-500/10 gap-1 text-xs">{periodLabels[period]}<button onClick={() => setPeriod('all')} aria-label="Remover filtro de período"><X className="w-3 h-3" /></button></Badge>}
            {emailFilter && <Badge variant="outline" className="border-border/60 text-muted-foreground gap-1 text-xs">Email: {emailFilter}<button onClick={() => { setEmailFilter(''); setEmailInput('') }} aria-label="Remover filtro de email"><X className="w-3 h-3" /></button></Badge>}
            {customerFilter && <Badge variant="outline" className="border-border/60 text-muted-foreground gap-1 text-xs font-mono">Customer: {customerFilter}<button onClick={() => { setCustomerFilter(''); setCustomerInput('') }} aria-label="Remover filtro de customer"><X className="w-3 h-3" /></button></Badge>}
            {statusFilter !== 'all' && <Badge variant="outline" className="border-border/60 text-muted-foreground gap-1 text-xs">Status: {statusFilter}<button onClick={() => setStatusFilter('all')} aria-label="Remover filtro de status"><X className="w-3 h-3" /></button></Badge>}
            {typeFilter && <Badge variant="outline" className="border-border/60 text-muted-foreground gap-1 text-xs">Tipo: {typeFilter}<button onClick={() => { setTypeFilter(''); setTypeInput('') }} aria-label="Remover filtro de tipo"><X className="w-3 h-3" /></button></Badge>}
          </div>
        )}
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.5 }} className="p-5 rounded-2xl border border-border bg-card">
        <DataTable columns={columnsWithClick} data={filtered} isLoading={isLoading} error={error} onRetry={refetch} />
      </motion.div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="bg-card border-border w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader><SheetTitle className="text-foreground">Detalhe do contato</SheetTitle></SheetHeader>
          {selectedContact && (
            <div className="mt-4 space-y-4">
              <div className="p-4 rounded-xl bg-accent border border-border space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Controle</p>
                <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs">
                  <div><span className="text-muted-foreground">Status: </span>
                    <Badge variant="outline" className={{ sent: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10', pending: 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10', failed: 'border-orange-500/30 text-orange-400 bg-orange-500/10', dead: 'border-red-500/30 text-red-400 bg-red-500/10' }[selectedContact.status]}>{selectedContact.status}</Badge>
                  </div>
                  <div><span className="text-muted-foreground">Tentativas: </span><span className="font-mono">{selectedContact.attempts}</span></div>
                  <div><span className="text-muted-foreground">Tipo: </span><span>{selectedContact.client_type}</span></div>
                  <div><span className="text-muted-foreground">Criado: </span><span className="font-mono">{selectedContact.created_at ? new Date(selectedContact.created_at).toLocaleString('pt-BR') : '—'}</span></div>
                  <div className="col-span-2"><span className="text-muted-foreground">Customer ID: </span><span className="font-mono break-all">{selectedContact.customer_id ?? '—'}</span></div>
                </div>
              </div>
              <div className="p-4 rounded-xl bg-accent border border-border space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Dados pessoais</p>
                <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs">
                  <div className="col-span-2"><span className="text-muted-foreground">Email: </span><span className="break-all">{selectedContact.email ?? '—'}</span></div>
                  <div><span className="text-muted-foreground">Nome: </span><span>{selectedContact.first_name ?? '—'}</span></div>
                  <div><span className="text-muted-foreground">Sobrenome: </span><span>{selectedContact.last_name ?? '—'}</span></div>
                  <div><span className="text-muted-foreground">CPF: </span><span className="font-mono">{selectedContact.cpf ?? '—'}</span></div>
                  <div><span className="text-muted-foreground">Nasc.: </span><span className="font-mono">{selectedContact.bday ?? '—'}</span></div>
                  <div><span className="text-muted-foreground">Gênero: </span><span>{selectedContact.gender ?? '—'}</span></div>
                  <div><span className="text-muted-foreground">Opt-in: </span>
                    {selectedContact.opt_in === null || selectedContact.opt_in === undefined ? <span className="text-muted-foreground">—</span> :
                      <Badge variant="outline" className={selectedContact.opt_in ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' : 'border-border text-muted-foreground'}>{selectedContact.opt_in ? 'Sim' : 'Não'}</Badge>}
                  </div>
                </div>
              </div>
              {selectedContact.last_error && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                  <p className="text-xs text-muted-foreground mb-1 font-semibold">Último erro</p>
                  <p className="text-xs text-red-400 font-mono">{selectedContact.last_error}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground mb-2 font-semibold">Payload raw</p>
                <pre className="text-xs font-mono text-muted-foreground bg-black/20 rounded-xl p-4 overflow-auto max-h-64 whitespace-pre-wrap break-all">{parsedPayload}</pre>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
