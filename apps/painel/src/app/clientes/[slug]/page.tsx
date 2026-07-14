'use client'
import { use, useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  ArrowLeft, Loader2, Plus, Trash2, Save, CheckCircle2,
  Eye, EyeOff, KeyRound, Shield, Send, Map as MapIcon, Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { useRouter } from 'next/navigation'
import { useTenant, useUpdateTenant, useDeleteTenant } from '@/hooks/useTenants'
import {
  useEnvironment,
  useUpdateConnection,
  useUpdateFieldMappings,
  useUpdateFlow,
  useCreateEnvironment,
} from '@/hooks/useEnvironment'
import { formatDate } from '@/lib/utils'
import type {
  Environment, ConnectionKind, Connection, FieldMapping, Flow, FlowKey, TenantStatus,
} from '@/types/api'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const updateTenantSchema = z.object({
  slug: z.string().min(2, 'Mínimo 2 caracteres').regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'kebab-case (ex: minha-loja)'),
  name: z.string().min(2, 'Mínimo 2 caracteres'),
  status: z.enum(['active', 'inactive']),
})

const createEnvSchema = z.object({
  slug: z.string().min(2).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'kebab-case'),
  name: z.string().min(2),
})

const fieldMappingsSchema = z.object({
  mappings: z.array(z.object({
    fieldKey: z.string().min(1, 'Campo obrigatório'),
    emarsysFieldId: z.string().min(1, 'ID obrigatório'),
    isExternalId: z.boolean(),
  })),
})

// ─── Definições de campos por conexão ─────────────────────────────────────────

type FieldDef = { key: string; label: string; placeholder?: string; isSecret?: boolean }

const CONNECTION_FIELDS: Record<ConnectionKind, FieldDef[]> = {
  vtex: [
    { key: 'appKey', label: 'App Key' },
    { key: 'productsEndpoint', label: 'Endpoint Produtos (catálogo)' },
    { key: 'masterDataEndpoint', label: 'Endpoint Master Data' },
    { key: 'ordersEndpoint', label: 'Endpoint Pedidos (OMS)' },
    { key: 'storeBaseUrl', label: 'URL pública da loja (links de SKU)' },
    { key: 'appToken', label: 'App Token', isSecret: true },
  ],
  vtex_io_app: [
    { key: 'workspace', label: 'Workspace' },
    { key: 'appKey', label: 'App Key' },
    { key: 'appToken', label: 'App Token', isSecret: true },
  ],
  emarsys_oauth2: [
    { key: 'clientId', label: 'Client ID' },
    { key: 'tokenEndpoint', label: 'Token Endpoint' },
    { key: 'apiBaseUrl', label: 'API Base URL' },
    { key: 'clientSecret', label: 'Client Secret', isSecret: true },
  ],
  emarsys_wsse: [
    { key: 'username', label: 'Username' },
    { key: 'secret', label: 'Secret', isSecret: true },
  ],
  emarsys_sales_api: [
    { key: 'merchantId', label: 'Merchant ID' },
    { key: 'apiUrl', label: 'API URL' },
    { key: 'token', label: 'Token estático (opcional — senão usa OAuth2)', isSecret: true },
  ],
  sftp_products: [
    { key: 'host', label: 'Host' },
    { key: 'port', label: 'Porta' },
    { key: 'username', label: 'Usuário' },
    { key: 'remotePath', label: 'Caminho remoto' },
    { key: 'password', label: 'Senha', isSecret: true },
  ],
  contacts_webhook: [
    { key: 'timeout', label: 'Timeout (ms)' },
    { key: 'authHeader', label: 'Token de autenticação do webhook', isSecret: true },
  ],
}

const CONNECTION_LABELS: Record<ConnectionKind, { title: string; hint?: string }> = {
  vtex: { title: 'VTEX API', hint: 'Catálogo, OMS e Master Data' },
  vtex_io_app: { title: 'VTEX IO App', hint: 'App customizado (opcional)' },
  emarsys_oauth2: { title: 'OAuth2', hint: 'Contacts API v3 e Wishlist' },
  emarsys_wsse: { title: 'WSSE', hint: 'Autenticação legada (opcional)' },
  emarsys_sales_api: { title: 'Sales Data API', hint: 'Envio de pedidos' },
  sftp_products: { title: 'SFTP de catálogo', hint: 'CSV de produtos para a Emarsys' },
  contacts_webhook: { title: 'Webhook de contatos', hint: 'Recebimento de contatos do e-commerce' },
}

const FLOW_META: Record<FlowKey, { label: string; desc: string }> = {
  products: { label: 'Produtos', desc: 'Catálogo VTEX → CSV → SFTP Emarsys' },
  orders: { label: 'Pedidos', desc: 'VTEX OMS → Emarsys Sales Data API' },
  contacts: { label: 'Contatos', desc: 'Webhook → Dedupe → Emarsys Contacts v3' },
  wishlist: { label: 'Wishlist', desc: 'VTEX Master Data → Emarsys wishlist/update' },
}

// ─── Blocos de UI compartilhados ──────────────────────────────────────────────

/** Card de seção no padrão da referência: chip de ícone + título + descrição. */
function SettingsSection({ title, description, icon: Icon, children }: {
  title: string
  description?: string
  icon: LucideIcon
  children: React.ReactNode
}) {
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 p-5 border-b border-border">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-primary" aria-hidden="true" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

/** Switch no padrão visual do produto. */
function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <div
      className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${disabled ? 'opacity-50' : 'cursor-pointer'} ${checked ? 'bg-emerald-500' : 'bg-border'}`}
      onClick={() => !disabled && onChange(!checked)}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      tabIndex={0}
      onKeyDown={e => e.key === ' ' && !disabled && onChange(!checked)}
    >
      <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
    </div>
  )
}

// ─── Aba: Dados do cliente ────────────────────────────────────────────────────

function DadosTab({ slug }: { slug: string }) {
  const router = useRouter()
  const { data: tenant, isLoading } = useTenant(slug)
  const updateTenant = useUpdateTenant(slug)
  const deleteTenant = useDeleteTenant()
  const [saved, setSaved] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<{ slug: string; name: string; status: TenantStatus }>({
    resolver: zodResolver(updateTenantSchema),
    values: tenant ? { slug: tenant.slug, name: tenant.name, status: tenant.status } : undefined,
  })

  async function onSubmit(values: { slug: string; name: string; status: TenantStatus }) {
    const updated = await updateTenant.mutateAsync(values)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    if (updated.slug !== slug) {
      router.replace(`/clientes/${updated.slug}`)
    }
  }

  async function onDelete() {
    await deleteTenant.mutateAsync(slug)
    router.replace('/clientes')
  }

  if (isLoading) return <div className="space-y-3 py-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-md space-y-4 py-4" noValidate>
      <div className="space-y-1">
        <label htmlFor="tenantSlug" className="text-sm font-medium text-foreground">Slug</label>
        <Input id="tenantSlug" className="border-border bg-accent font-mono" aria-invalid={!!errors.slug} {...register('slug')} />
        {errors.slug
          ? <p className="text-xs text-red-400">{errors.slug.message}</p>
          : <p className="text-xs text-muted-foreground">Renomear muda as URLs derivadas (painel e webhook de contatos — reconfigure quem chama)</p>}
      </div>
      <div className="space-y-1">
        <label htmlFor="name" className="text-sm font-medium text-foreground">Nome</label>
        <Input id="name" className="border-border bg-accent" aria-invalid={!!errors.name} {...register('name')} />
        {errors.name && <p className="text-xs text-red-400">{errors.name.message}</p>}
      </div>
      <div className="space-y-1">
        <label htmlFor="status" className="text-sm font-medium text-foreground">Status</label>
        <select
          id="status"
          className="w-full text-sm rounded-xl border border-border bg-accent px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          {...register('status')}
        >
          <option value="active">Ativo</option>
          <option value="inactive">Inativo</option>
        </select>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isSubmitting || updateTenant.isPending} className="gap-2">
          {(isSubmitting || updateTenant.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Save className="w-4 h-4" />}
          {saved ? 'Salvo!' : 'Salvar alterações'}
        </Button>
        {updateTenant.error && <p className="text-xs text-red-400">{updateTenant.error.message}</p>}
      </div>
      {tenant && (
        <div className="pt-4 border-t border-border space-y-1 text-xs text-muted-foreground">
          <p>Criado em: {formatDate(tenant.createdAt)}</p>
          <p>Atualizado em: {formatDate(tenant.updatedAt)}</p>
        </div>
      )}

      {/* Zona de perigo — exclusão definitiva (cascade: ambientes, conexões e dados) */}
      <div className="pt-4 border-t border-red-500/20 space-y-3">
        <p className="text-sm font-semibold text-red-400">Zona de perigo</p>
        {!confirmDelete ? (
          <Button type="button" variant="outline" className="gap-2 border-red-500/30 text-red-400 hover:bg-red-500/10" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="w-4 h-4" /> Excluir cliente
          </Button>
        ) : (
          <div className="space-y-2 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
            <p className="text-sm text-red-400">
              Excluir <strong>{tenant?.name}</strong> apaga permanentemente todos os ambientes,
              conexões, credenciais e dados sincronizados. Não dá pra desfazer.
            </p>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" className="gap-2 border-red-500/40 text-red-400 hover:bg-red-500/20" disabled={deleteTenant.isPending} onClick={onDelete}>
                {deleteTenant.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Confirmar exclusão
              </Button>
              <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
            </div>
            {deleteTenant.error && <p className="text-xs text-red-400">{deleteTenant.error.message}</p>}
          </div>
        )}
      </div>
    </form>
  )
}

// ─── Formulário de uma conexão (dentro das seções) ────────────────────────────

function ConnectionForm({ envId, connection }: { envId: string; connection: Connection }) {
  const updateConn = useUpdateConnection(envId, connection.kind)
  const fields = CONNECTION_FIELDS[connection.kind] ?? []
  const meta = CONNECTION_LABELS[connection.kind]
  const [saved, setSaved] = useState(false)
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({})

  const { register, handleSubmit, formState: { isSubmitting } } = useForm<{ config: Record<string, string>; secrets: Record<string, string> }>({
    defaultValues: { config: connection.config ?? {}, secrets: {} },
  })

  async function onSubmit(values: { config: Record<string, string>; secrets: Record<string, string> }) {
    const secrets: Record<string, string> = {}
    fields.filter(f => f.isSecret).forEach(f => {
      if (values.secrets[f.key]) secrets[f.key] = values.secrets[f.key]
    })
    await updateConn.mutateAsync({ config: values.config, secrets: Object.keys(secrets).length ? secrets : undefined })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground">{meta.title}</p>
          {meta.hint && <span className="text-xs text-muted-foreground">· {meta.hint}</span>}
        </div>
        <div className="flex items-center gap-2">
          {connection.hasSecrets && (
            <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 text-xs">
              <CheckCircle2 className="w-3 h-3 mr-1" aria-hidden="true" /> Credenciais salvas
            </Badge>
          )}
          <Button type="submit" size="sm" disabled={isSubmitting || updateConn.isPending} className="gap-1.5 h-8">
            {(isSubmitting || updateConn.isPending) ? <Loader2 className="w-3 h-3 animate-spin" /> : saved ? <CheckCircle2 className="w-3 h-3 text-emerald-300" /> : <Save className="w-3 h-3" />}
            {saved ? 'Salvo!' : 'Salvar'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {fields.map(field => (
          <div key={field.key}>
            <label className="text-xs text-muted-foreground">{field.label}</label>
            {field.isSecret ? (
              <div className="relative mt-1">
                <Input
                  type={showSecrets[field.key] ? 'text' : 'password'}
                  placeholder={connection.hasSecrets ? '•••••••• (deixe em branco para manter)' : ''}
                  className="pr-10 font-mono text-sm bg-background/50 border-border"
                  {...register(`secrets.${field.key}`)}
                />
                <button
                  type="button"
                  onClick={() => setShowSecrets(prev => ({ ...prev, [field.key]: !prev[field.key] }))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showSecrets[field.key] ? 'Ocultar' : 'Exibir'}
                >
                  {showSecrets[field.key] ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                </button>
              </div>
            ) : (
              <Input className="mt-1 bg-background/50 border-border text-sm" {...register(`config.${field.key}`)} />
            )}
          </div>
        ))}
      </div>
      {updateConn.error && <p className="text-xs text-red-400">{updateConn.error.message}</p>}
    </form>
  )
}

/** Agrupa vários kinds numa SettingsSection, separados por divisórias. */
function ConnectionGroup({ envId, connections, kinds }: {
  envId: string
  connections: Connection[]
  kinds: ConnectionKind[]
}) {
  const byKind = new Map(connections.map(c => [c.kind, c]))
  return (
    <div className="divide-y divide-border [&>*]:py-5 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0">
      {kinds.map(kind => (
        <ConnectionForm
          key={kind}
          envId={envId}
          connection={byKind.get(kind) ?? { kind, config: {}, hasSecrets: false }}
        />
      ))}
    </div>
  )
}

// ─── Seção: Mapeamento de campos ──────────────────────────────────────────────

function FieldMappingsSection({ envId, env }: { envId: string; env: { fieldMappings: FieldMapping[] } }) {
  const updateMappings = useUpdateFieldMappings(envId)
  const [saved, setSaved] = useState(false)

  const { register, handleSubmit, control, watch, formState: { isSubmitting } } = useForm<{ mappings: FieldMapping[] }>({
    resolver: zodResolver(fieldMappingsSchema),
    values: { mappings: env.fieldMappings },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'mappings' })
  const watched = watch('mappings')

  async function onSubmit(values: { mappings: FieldMapping[] }) {
    await updateMappings.mutateAsync(values.mappings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b border-border">
              <th className="pb-3 pr-3 font-medium">Campo do sistema</th>
              <th className="pb-3 pr-3 font-medium">Field ID Emarsys</th>
              <th className="pb-3 pr-3 font-medium text-center">External ID</th>
              <th className="pb-3 pr-3 font-medium">Status</th>
              <th className="pb-3"></th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field, idx) => {
              const row = watched?.[idx]
              const ok = row?.fieldKey && row?.emarsysFieldId
              return (
                <tr key={field.id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-3">
                    <Input className="border-border bg-background/50 font-mono text-xs h-8" placeholder="ex: customer_id" {...register(`mappings.${idx}.fieldKey`)} />
                  </td>
                  <td className="py-2 pr-3">
                    <Input className="w-24 border-border bg-background/50 font-mono text-xs h-8" placeholder="ex: 3695" {...register(`mappings.${idx}.emarsysFieldId`)} />
                  </td>
                  <td className="py-2 pr-3 text-center">
                    <input type="checkbox" {...register(`mappings.${idx}.isExternalId`)} className="w-4 h-4 accent-primary" aria-label="Usar como external ID" />
                  </td>
                  <td className="py-2 pr-3">
                    {ok
                      ? <span className="text-xs text-emerald-400">✓ Configurado</span>
                      : <span className="text-xs text-muted-foreground">Incompleto</span>}
                  </td>
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => remove(idx)}
                      className="text-muted-foreground hover:text-red-400 transition-colors"
                      aria-label="Remover mapeamento"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!fields.length && (
          <p className="text-xs text-muted-foreground py-4">
            Nenhum campo mapeado. Os campos de sistema da Emarsys (nome, email, telefone…) já têm IDs padrão — mapeie aqui os campos custom da conta (ex: customer_id, cpf, buyer_type).
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="sm" className="gap-1.5 border-border"
          onClick={() => append({ fieldKey: '', emarsysFieldId: '', isExternalId: false })}>
          <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Adicionar campo
        </Button>
        <Button type="submit" size="sm" disabled={isSubmitting || updateMappings.isPending} className="gap-1.5">
          {(isSubmitting || updateMappings.isPending) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" /> : <Save className="w-3.5 h-3.5" />}
          {saved ? 'Salvo!' : 'Salvar mapeamentos'}
        </Button>
        {updateMappings.error && <p className="text-xs text-red-400">{updateMappings.error.message}</p>}
      </div>
    </form>
  )
}

// ─── Agendamento amigável ↔ cron ─────────────────────────────────────────────

type ScheduleMode = 'minutes' | 'hours' | 'daily' | 'custom'
type Schedule = { mode: ScheduleMode; n: number; time: string; raw: string }

function parseCronToSchedule(cron: string | null): Schedule {
  const fallback: Schedule = { mode: 'minutes', n: 30, time: '03:00', raw: cron ?? '' }
  if (!cron) return fallback
  let m = cron.match(/^\*\/(\d+) \* \* \* \*$/)
  if (m) return { ...fallback, mode: 'minutes', n: Number(m[1]) }
  m = cron.match(/^0 \*\/(\d+) \* \* \*$/)
  if (m) return { ...fallback, mode: 'hours', n: Number(m[1]) }
  m = cron.match(/^(\d+) (\d+) \* \* \*$/)
  if (m) return { ...fallback, mode: 'daily', time: `${m[2].padStart(2, '0')}:${m[1].padStart(2, '0')}` }
  return { ...fallback, mode: 'custom', raw: cron }
}

function scheduleToCron(s: Schedule): string {
  if (s.mode === 'minutes') return `*/${s.n} * * * *`
  if (s.mode === 'hours') return `0 */${s.n} * * *`
  if (s.mode === 'daily') {
    const [h, min] = s.time.split(':')
    return `${Number(min) || 0} ${Number(h) || 0} * * *`
  }
  return s.raw.trim()
}

function scheduleSummary(s: Schedule): string {
  if (s.mode === 'minutes') return `a cada ${s.n} min`
  if (s.mode === 'hours') return `a cada ${s.n}h`
  if (s.mode === 'daily') return `diário às ${s.time}`
  return s.raw || 'cron personalizado'
}

// ─── Seção: Automações ────────────────────────────────────────────────────────

function FlowRow({ envId, flow }: { envId: string; flow: Flow }) {
  const updateFlow = useUpdateFlow(envId, flow.flow)
  const meta = FLOW_META[flow.flow]
  const [enabled, setEnabled] = useState(flow.enabled)
  const [debug, setDebug] = useState(flow.settings?.debug === true)
  const [schedule, setSchedule] = useState<Schedule>(() => parseCronToSchedule(flow.cronExpression))
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)

  function touch<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setDirty(true) }
  }

  async function handleSave() {
    const cron = scheduleToCron(schedule)
    await updateFlow.mutateAsync({
      enabled,
      cronExpression: cron || null,
      settings: { ...(flow.settings ?? {}), debug },
    })
    setSaved(true)
    setDirty(false)
    setTimeout(() => setSaved(false), 2000)
  }

  const selectCls = 'text-xs rounded-lg border border-border bg-background px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50'

  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">{meta.label}</span>
            <span className="text-xs text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded font-mono">
              {enabled ? scheduleSummary(schedule) : 'desativado'}
            </span>
            {debug && (
              <Badge variant="outline" className="border-amber-500/30 text-amber-400 bg-amber-500/10 text-xs">debug</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{meta.desc}</p>
        </div>
        <Toggle checked={enabled} onChange={touch(setEnabled)} label={`Ativar automação de ${meta.label}`} />
      </div>

      {enabled && (
        <div className="mt-3 flex flex-wrap items-center gap-2 pl-0.5">
          {(schedule.mode === 'minutes' || schedule.mode === 'hours') && (
            <>
              <span className="text-xs text-muted-foreground">A cada</span>
              <Input
                type="number"
                min={1}
                max={schedule.mode === 'minutes' ? 59 : 23}
                value={schedule.n}
                onChange={e => {
                  const max = schedule.mode === 'minutes' ? 59 : 23
                  const n = Math.max(1, Math.min(max, Number(e.target.value) || 1))
                  touch(setSchedule)({ ...schedule, n })
                }}
                className="border-border bg-background text-xs h-8 w-16"
              />
            </>
          )}
          <select
            className={selectCls}
            value={schedule.mode}
            onChange={e => touch(setSchedule)({ ...schedule, mode: e.target.value as ScheduleMode })}
            aria-label="Unidade de frequência"
          >
            <option value="minutes">Minutos</option>
            <option value="hours">Horas</option>
            <option value="daily">Dia</option>
            <option value="custom">Avançado (cron)</option>
          </select>
          {schedule.mode === 'daily' && (
            <Input
              type="time"
              value={schedule.time}
              onChange={e => touch(setSchedule)({ ...schedule, time: e.target.value })}
              className="border-border bg-background text-xs h-8 w-26"
            />
          )}
          {schedule.mode === 'custom' && (
            <Input
              value={schedule.raw}
              onChange={e => touch(setSchedule)({ ...schedule, raw: e.target.value })}
              placeholder="*/30 * * * *"
              className="border-border bg-background text-xs h-8 font-mono w-36"
            />
          )}

          <div className="flex items-center gap-1.5 ml-2">
            <span className="text-xs text-muted-foreground">Modo debug</span>
            <Toggle checked={debug} onChange={touch(setDebug)} label={`Modo debug de ${meta.label}`} />
          </div>
        </div>
      )}

      {(dirty || updateFlow.error) && (
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" onClick={handleSave} disabled={updateFlow.isPending} className="gap-1.5 h-8">
            {updateFlow.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : saved ? <CheckCircle2 className="w-3 h-3 text-emerald-300" /> : <Save className="w-3 h-3" />}
            {saved ? 'Salvo!' : 'Salvar alterações'}
          </Button>
          {updateFlow.error && <p className="text-xs text-red-400">{updateFlow.error.message}</p>}
        </div>
      )}
    </div>
  )
}

// ─── Configurações do ambiente (seções empilhadas) ────────────────────────────

type SettingsPart = 'credenciais' | 'campos' | 'automacoes'

function EnvironmentSettings({ envId, part }: { envId: string; part: SettingsPart }) {
  const { data: env, isLoading } = useEnvironment(envId)

  if (isLoading) {
    return <div className="space-y-4">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-44 w-full rounded-2xl" />)}</div>
  }
  if (!env) return <p className="text-sm text-muted-foreground py-4">Ambiente não encontrado.</p>

  const flowsByKey = new Map(env.flows.map(f => [f.flow, f]))
  const flowKeys: FlowKey[] = ['products', 'orders', 'contacts', 'wishlist']

  if (part === 'campos') {
    return (
      <SettingsSection title="Mapeamento de campos Emarsys" description="Field IDs custom da conta Emarsys deste ambiente" icon={MapIcon}>
        <FieldMappingsSection envId={envId} env={env} />
      </SettingsSection>
    )
  }

  if (part === 'automacoes') {
    return (
      <SettingsSection title="Automações" description="Agendamento e modo de execução por fluxo" icon={Zap}>
        <div className="divide-y divide-border">
          {flowKeys.map(key => (
            <FlowRow
              key={`${envId}-${key}`}
              envId={envId}
              flow={flowsByKey.get(key) ?? { flow: key, enabled: false, cronExpression: null, settings: {} }}
            />
          ))}
        </div>
      </SettingsSection>
    )
  }

  return (
    <div className="space-y-6">
      <SettingsSection title="Credenciais VTEX" description="App key/token e endpoints por fluxo (catálogo, Master Data e OMS)" icon={KeyRound}>
        <ConnectionGroup envId={envId} connections={env.connections} kinds={['vtex']} />
      </SettingsSection>

      <SettingsSection title="Credenciais SAP Emarsys" description="Contacts API v3, Sales Data e WSSE" icon={Shield}>
        <ConnectionGroup envId={envId} connections={env.connections} kinds={['emarsys_oauth2', 'emarsys_sales_api', 'emarsys_wsse']} />
      </SettingsSection>

      <SettingsSection title="Entrega de dados" description="Canais de entrada e saída de arquivos/eventos" icon={Send}>
        <ConnectionGroup envId={envId} connections={env.connections} kinds={['sftp_products', 'contacts_webhook']} />
      </SettingsSection>
    </div>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function ClienteDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const { data: tenant, isLoading } = useTenant(slug)
  const createEnv = useCreateEnvironment(slug)
  const [activeEnvId, setActiveEnvId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const environments: Environment[] = tenant?.environments ?? []
  // Seleciona o primeiro ambiente automaticamente
  useEffect(() => {
    if (!activeEnvId && environments.length) setActiveEnvId(environments[0].id)
  }, [environments, activeEnvId])

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<z.infer<typeof createEnvSchema>>({
    resolver: zodResolver(createEnvSchema),
  })

  async function onCreateEnv(values: z.infer<typeof createEnvSchema>) {
    const created = await createEnv.mutateAsync(values)
    reset()
    setDialogOpen(false)
    if (created?.id) setActiveEnvId(created.id)
  }

  return (
    <div className="py-6 space-y-6 max-w-[1200px] mx-auto">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <Link href="/clientes" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4">
          <ArrowLeft className="w-3 h-3" aria-hidden="true" /> Clientes
        </Link>
        <div className="flex items-center gap-3">
          {isLoading ? (
            <Skeleton className="h-8 w-48" />
          ) : (
            <>
              <h1 className="text-2xl font-bold">{tenant?.name ?? slug}</h1>
              <Badge variant="outline" className={tenant?.status === 'active' ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' : 'border-border text-muted-foreground'}>
                {tenant?.status === 'active' ? 'Ativo' : 'Inativo'}
              </Badge>
              <span className="font-mono text-xs text-muted-foreground">{slug}</span>
            </>
          )}
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.5 }}>
        {/* Pills de ambiente — valem para Credenciais, Campos e Automações */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          {environments.map(env => (
            <button
              key={env.id}
              onClick={() => setActiveEnvId(env.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeEnvId === env.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/30'
              }`}
            >
              {env.name}
            </button>
          ))}
          <button
            onClick={() => setDialogOpen(true)}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-card border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Novo ambiente
          </button>
        </div>

        <Tabs defaultValue="credenciais">
          <TabsList className="mb-4">
            <TabsTrigger value="credenciais">Credenciais</TabsTrigger>
            <TabsTrigger value="campos" disabled={!activeEnvId}>Campos Emarsys</TabsTrigger>
            <TabsTrigger value="automacoes" disabled={!activeEnvId}>Automações</TabsTrigger>
            <TabsTrigger value="dados">Dados do cliente</TabsTrigger>
          </TabsList>

          {(['credenciais', 'campos', 'automacoes'] as const).map(part => (
            <TabsContent key={part} value={part}>
              {isLoading ? (
                <div className="space-y-4">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-44 w-full rounded-2xl" />)}</div>
              ) : !environments.length ? (
                <div className="p-10 rounded-2xl border border-dashed border-border bg-card/50 flex flex-col items-center gap-3 text-center">
                  <Zap className="w-10 h-10 text-muted-foreground/40" aria-hidden="true" />
                  <p className="text-sm font-medium text-foreground">Este cliente ainda não tem ambientes</p>
                  <p className="text-xs text-muted-foreground max-w-sm">
                    Um ambiente representa uma loja/conta (ex: loja principal, outlet). Crie o primeiro para configurar credenciais e automações.
                  </p>
                  <Button size="sm" className="gap-1.5 mt-1" onClick={() => setDialogOpen(true)}>
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Criar primeiro ambiente
                  </Button>
                </div>
              ) : activeEnvId ? (
                <EnvironmentSettings key={`${activeEnvId}-${part}`} envId={activeEnvId} part={part} />
              ) : null}
            </TabsContent>
          ))}

          <TabsContent value="dados">
            <DadosTab slug={slug} />
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* Dialog: novo ambiente */}
      <Dialog open={dialogOpen} onOpenChange={v => { if (!v) { reset(); setDialogOpen(false) } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Novo ambiente</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onCreateEnv)} className="space-y-4 mt-2" noValidate>
            <div className="space-y-1">
              <label htmlFor="envSlug" className="text-sm font-medium text-foreground">Slug</label>
              <Input id="envSlug" placeholder="ex: producao" className="border-border bg-accent font-mono" aria-invalid={!!errors.slug} {...register('slug')} />
              {errors.slug && <p className="text-xs text-red-400">{errors.slug.message}</p>}
            </div>
            <div className="space-y-1">
              <label htmlFor="envName" className="text-sm font-medium text-foreground">Nome</label>
              <Input id="envName" placeholder="ex: Produção" className="border-border bg-accent" aria-invalid={!!errors.name} {...register('name')} />
              {errors.name && <p className="text-xs text-red-400">{errors.name.message}</p>}
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => { reset(); setDialogOpen(false) }}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting || createEnv.isPending}>
                {(isSubmitting || createEnv.isPending) ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Criar ambiente
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
