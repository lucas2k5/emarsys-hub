'use client'
import { use, useState } from 'react'
import { motion } from 'framer-motion'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  ArrowLeft, Loader2, Plus, Trash2, Save,
  CheckCircle2, AlertCircle, Eye, EyeOff,
} from 'lucide-react'
import Link from 'next/link'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
  Environment,
  ConnectionKind,
  Connection,
  FieldMapping,
  Flow,
  FlowKey,
  TenantStatus,
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

// ─── Connection config definitions per kind ──────────────────────────────────

type FieldDef = { key: string; label: string; placeholder?: string; isSecret?: boolean }

const CONNECTION_FIELDS: Record<ConnectionKind, FieldDef[]> = {
  vtex: [
    { key: 'baseUrl', label: 'Base URL' },
    { key: 'appKey', label: 'App Key' },
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
    { key: 'url', label: 'URL do webhook' },
    { key: 'authHeader', label: 'Header de autenticação', isSecret: true },
    { key: 'timeout', label: 'Timeout (ms)' },
  ],
}

const CONNECTION_LABELS: Record<ConnectionKind, string> = {
  vtex: 'VTEX API',
  vtex_io_app: 'VTEX IO App',
  emarsys_oauth2: 'Emarsys OAuth2',
  emarsys_wsse: 'Emarsys WSSE',
  emarsys_sales_api: 'Emarsys Sales API',
  sftp_products: 'SFTP Produtos',
  contacts_webhook: 'Webhook Contatos',
}

const FLOW_LABELS: Record<FlowKey, string> = {
  products: 'Produtos',
  orders: 'Pedidos',
  contacts: 'Contatos',
  wishlist: 'Wishlist',
}

// ─── Tab: Dados do Tenant ─────────────────────────────────────────────────────

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
    // Slug renomeado → a página atual deixa de existir; navega pra nova URL
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

// ─── Tab: Ambientes ───────────────────────────────────────────────────────────

function AmbientesTab({ slug, onSelectEnv }: { slug: string; onSelectEnv: (env: Environment) => void }) {
  const { data: tenant, isLoading } = useTenant(slug)
  const createEnv = useCreateEnvironment(slug)
  const [dialogOpen, setDialogOpen] = useState(false)

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<z.infer<typeof createEnvSchema>>({
    resolver: zodResolver(createEnvSchema),
  })

  async function onSubmit(values: z.infer<typeof createEnvSchema>) {
    await createEnv.mutateAsync(values)
    reset()
    setDialogOpen(false)
  }

  if (isLoading) return <div className="space-y-3 py-4">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>

  const environments = tenant?.environments ?? []

  return (
    <div className="py-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{environments.length} ambiente(s) configurado(s)</p>
        <Button size="sm" onClick={() => setDialogOpen(true)} className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Novo ambiente
        </Button>
      </div>

      {!environments.length ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3 border border-dashed border-border rounded-2xl">
          <p className="text-sm text-muted-foreground">Nenhum ambiente criado</p>
          <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Criar ambiente
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {environments.map(env => (
            <div
              key={env.id}
              className="flex items-center justify-between p-4 rounded-xl border border-border bg-accent/30 hover:bg-accent/60 transition-colors cursor-pointer"
              onClick={() => onSelectEnv(env)}
            >
              <div className="flex items-center gap-3">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-foreground">{env.name}</span>
                  <span className="text-xs font-mono text-muted-foreground">{env.slug}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="outline" className={env.status === 'active' ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' : 'border-border text-muted-foreground'}>
                  {env.status === 'active' ? 'Ativo' : 'Inativo'}
                </Badge>
                <span className="text-xs text-primary hover:underline">Configurar</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={v => { if (!v) { reset(); setDialogOpen(false) } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Novo ambiente</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2" noValidate>
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

// ─── Connection Card ──────────────────────────────────────────────────────────

function ConnectionCard({ envId, connection }: { envId: string; connection: Connection }) {
  const updateConn = useUpdateConnection(envId, connection.kind)
  const fields = CONNECTION_FIELDS[connection.kind] ?? []
  const [saved, setSaved] = useState(false)
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({})

  const { register, handleSubmit, formState: { isSubmitting } } = useForm<{ config: Record<string, string>; secrets: Record<string, string> }>({
    defaultValues: {
      config: connection.config ?? {},
      secrets: {},
    },
  })

  async function onSubmit(values: { config: Record<string, string>; secrets: Record<string, string> }) {
    // Filtra secrets vazios — só envia se preenchido
    const secrets: Record<string, string> = {}
    fields.filter(f => f.isSecret).forEach(f => {
      if (values.secrets[f.key]) secrets[f.key] = values.secrets[f.key]
    })
    await updateConn.mutateAsync({ config: values.config, secrets: Object.keys(secrets).length ? secrets : undefined })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const configFields = fields.filter(f => !f.isSecret)
  const secretFields = fields.filter(f => f.isSecret)

  return (
    <div className="p-4 rounded-xl border border-border bg-accent/20 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">{CONNECTION_LABELS[connection.kind]}</p>
        {connection.hasSecrets && (
          <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 text-xs">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Credenciais salvas
          </Badge>
        )}
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
        {configFields.map(field => (
          <div key={field.key} className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{field.label}</label>
            <Input
              placeholder={field.placeholder}
              className="border-border bg-background text-sm h-8"
              {...register(`config.${field.key}`)}
            />
          </div>
        ))}
        {secretFields.length > 0 && (
          <div className="pt-2 border-t border-border space-y-3">
            <p className="text-xs text-muted-foreground">
              {connection.hasSecrets ? 'Deixe em branco para manter as credenciais atuais' : 'Defina as credenciais'}
            </p>
            {secretFields.map(field => (
              <div key={field.key} className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{field.label}</label>
                <div className="relative">
                  <Input
                    type={showSecrets[field.key] ? 'text' : 'password'}
                    placeholder={connection.hasSecrets ? '••••••••' : field.placeholder ?? ''}
                    className="border-border bg-background text-sm h-8 pr-8"
                    {...register(`secrets.${field.key}`)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecrets(prev => ({ ...prev, [field.key]: !prev[field.key] }))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showSecrets[field.key] ? 'Ocultar' : 'Exibir'}
                  >
                    {showSecrets[field.key] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 pt-1">
          <Button type="submit" size="sm" disabled={isSubmitting || updateConn.isPending} className="gap-1.5 h-8">
            {(isSubmitting || updateConn.isPending) ? <Loader2 className="w-3 h-3 animate-spin" /> : saved ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Save className="w-3 h-3" />}
            {saved ? 'Salvo!' : 'Salvar'}
          </Button>
          {updateConn.error && <p className="text-xs text-red-400">{updateConn.error.message}</p>}
        </div>
      </form>
    </div>
  )
}

// ─── Tab: Conexões ────────────────────────────────────────────────────────────

function ConexoesTab({ envId }: { envId: string }) {
  const { data: env, isLoading } = useEnvironment(envId)

  if (isLoading) return <div className="space-y-3 py-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 w-full rounded-xl" />)}</div>
  if (!env) return <p className="text-sm text-muted-foreground py-4">Ambiente não encontrado.</p>

  const allKinds = Object.keys(CONNECTION_FIELDS) as ConnectionKind[]
  const existingByKind = new Map(env.connections.map(c => [c.kind, c]))

  return (
    <div className="py-4 space-y-4">
      {allKinds.map(kind => {
        const conn = existingByKind.get(kind) ?? { kind, config: {}, hasSecrets: false }
        return <ConnectionCard key={kind} envId={envId} connection={conn} />
      })}
    </div>
  )
}

// ─── Tab: Campos Emarsys ──────────────────────────────────────────────────────

function CamposTab({ envId }: { envId: string }) {
  const { data: env, isLoading } = useEnvironment(envId)
  const updateMappings = useUpdateFieldMappings(envId)
  const [saved, setSaved] = useState(false)

  const { register, handleSubmit, control, formState: { isSubmitting } } = useForm<{ mappings: FieldMapping[] }>({
    resolver: zodResolver(fieldMappingsSchema),
    values: env ? { mappings: env.fieldMappings } : undefined,
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'mappings' })

  async function onSubmit(values: { mappings: FieldMapping[] }) {
    await updateMappings.mutateAsync(values.mappings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (isLoading) return <div className="space-y-3 py-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-xl" />)}</div>

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="py-4 space-y-4" noValidate>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-accent/30">
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 text-xs text-muted-foreground font-medium">Campo do sistema</th>
              <th className="text-left py-3 px-4 text-xs text-muted-foreground font-medium">ID Emarsys</th>
              <th className="text-center py-3 px-4 text-xs text-muted-foreground font-medium">External ID</th>
              <th className="py-3 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field, idx) => (
              <tr key={field.id} className="border-b border-border">
                <td className="py-2 px-3">
                  <Input className="border-border bg-accent font-mono text-xs h-8" {...register(`mappings.${idx}.fieldKey`)} />
                </td>
                <td className="py-2 px-3">
                  <Input className="border-border bg-accent font-mono text-xs h-8" {...register(`mappings.${idx}.emarsysFieldId`)} />
                </td>
                <td className="py-2 px-3 text-center">
                  <input type="checkbox" {...register(`mappings.${idx}.isExternalId`)} className="w-4 h-4 accent-primary" />
                </td>
                <td className="py-2 px-3">
                  <button
                    type="button"
                    onClick={() => remove(idx)}
                    className="text-muted-foreground hover:text-red-400 transition-colors"
                    aria-label="Remover mapeamento"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 border-border"
          onClick={() => append({ fieldKey: '', emarsysFieldId: '', isExternalId: false })}
        >
          <Plus className="w-3.5 h-3.5" /> Adicionar campo
        </Button>
        <Button type="submit" size="sm" disabled={isSubmitting || updateMappings.isPending} className="gap-1.5">
          {(isSubmitting || updateMappings.isPending) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Save className="w-3.5 h-3.5" />}
          {saved ? 'Salvo!' : 'Salvar mapeamentos'}
        </Button>
        {updateMappings.error && <p className="text-xs text-red-400">{updateMappings.error.message}</p>}
      </div>
    </form>
  )
}

// ─── Flow Toggle Card ─────────────────────────────────────────────────────────

// ─── Agendamento amigável ↔ cron ─────────────────────────────────────────────
// O backend continua 100% em cron (environment_flows.cron_expression);
// aqui só traduzimos pra linguagem de gente.

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
  if (s.mode === 'minutes') return `Executa a cada ${s.n} minuto${s.n > 1 ? 's' : ''}`
  if (s.mode === 'hours') return `Executa a cada ${s.n} hora${s.n > 1 ? 's' : ''}`
  if (s.mode === 'daily') return `Executa diariamente às ${s.time}`
  return 'Expressão cron personalizada'
}

const MINUTE_OPTIONS = [5, 10, 15, 20, 30, 45]
const HOUR_OPTIONS = [1, 2, 3, 4, 6, 8, 12]

function FlowCard({ envId, flow }: { envId: string; flow: Flow }) {
  const updateFlow = useUpdateFlow(envId, flow.flow)
  const [enabled, setEnabled] = useState(flow.enabled)
  const [schedule, setSchedule] = useState<Schedule>(() => parseCronToSchedule(flow.cronExpression))
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    const cron = scheduleToCron(schedule)
    await updateFlow.mutateAsync({ enabled, cronExpression: cron || null })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const selectCls = 'text-sm rounded-xl border border-border bg-background px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50'

  return (
    <div className="p-4 rounded-xl border border-border bg-accent/20 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">{FLOW_LABELS[flow.flow]}</p>
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-xs text-muted-foreground">{enabled ? 'Ativo' : 'Inativo'}</span>
          <div
            className={`relative w-9 h-5 rounded-full transition-colors ${enabled ? 'bg-emerald-500' : 'bg-border'}`}
            onClick={() => setEnabled(!enabled)}
            role="switch"
            aria-checked={enabled}
            tabIndex={0}
            onKeyDown={e => e.key === ' ' && setEnabled(!enabled)}
          >
            <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-4' : ''}`} />
          </div>
        </label>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">Frequência</label>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={selectCls}
            value={schedule.mode}
            disabled={!enabled}
            onChange={e => setSchedule({ ...schedule, mode: e.target.value as ScheduleMode })}
          >
            <option value="minutes">A cada X minutos</option>
            <option value="hours">A cada X horas</option>
            <option value="daily">Diariamente às…</option>
            <option value="custom">Avançado (cron)</option>
          </select>

          {schedule.mode === 'minutes' && (
            <select className={selectCls} value={schedule.n} disabled={!enabled}
              onChange={e => setSchedule({ ...schedule, n: Number(e.target.value) })}>
              {MINUTE_OPTIONS.map(n => <option key={n} value={n}>{n} min</option>)}
              {!MINUTE_OPTIONS.includes(schedule.n) && <option value={schedule.n}>{schedule.n} min</option>}
            </select>
          )}

          {schedule.mode === 'hours' && (
            <select className={selectCls} value={schedule.n} disabled={!enabled}
              onChange={e => setSchedule({ ...schedule, n: Number(e.target.value) })}>
              {HOUR_OPTIONS.map(n => <option key={n} value={n}>{n}h</option>)}
              {!HOUR_OPTIONS.includes(schedule.n) && <option value={schedule.n}>{schedule.n}h</option>}
            </select>
          )}

          {schedule.mode === 'daily' && (
            <Input
              type="time"
              value={schedule.time}
              disabled={!enabled}
              onChange={e => setSchedule({ ...schedule, time: e.target.value })}
              className="border-border bg-background text-sm h-8 w-28"
            />
          )}

          {schedule.mode === 'custom' && (
            <Input
              value={schedule.raw}
              disabled={!enabled}
              onChange={e => setSchedule({ ...schedule, raw: e.target.value })}
              placeholder="*/30 * * * *"
              className="border-border bg-background text-sm h-8 font-mono w-40"
            />
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {scheduleSummary(schedule)}
          {schedule.mode !== 'custom' && <span className="font-mono text-muted-foreground/60"> · {scheduleToCron(schedule)}</span>}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleSave} disabled={updateFlow.isPending} className="gap-1.5 h-8">
          {updateFlow.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : saved ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Save className="w-3 h-3" />}
          {saved ? 'Salvo!' : 'Salvar'}
        </Button>
        {updateFlow.error && <p className="text-xs text-red-400">{updateFlow.error.message}</p>}
      </div>
    </div>
  )
}

// ─── Tab: Automações ──────────────────────────────────────────────────────────────

const ALL_FLOWS: FlowKey[] = ['products', 'orders', 'contacts', 'wishlist']

function FluxosTab({ envId }: { envId: string }) {
  const { data: env, isLoading } = useEnvironment(envId)

  if (isLoading) return <div className="space-y-3 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}</div>
  if (!env) return <p className="text-sm text-muted-foreground py-4">Ambiente não encontrado.</p>

  const flowsByKey = new Map(env.flows.map(f => [f.flow, f]))

  return (
    <div className="py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
      {ALL_FLOWS.map(key => {
        const flow = flowsByKey.get(key) ?? { flow: key, enabled: false, cronExpression: null, settings: {} }
        return <FlowCard key={key} envId={envId} flow={flow} />
      })}
    </div>
  )
}

// ─── Page principal ───────────────────────────────────────────────────────────

export default function ClienteDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const { data: tenant, isLoading } = useTenant(slug)
  const [selectedEnv, setSelectedEnv] = useState<Environment | null>(null)
  const [mainTab, setMainTab] = useState('dados')

  // Quando o usuário seleciona um ambiente, muda automaticamente pra tab Conexões
  function handleSelectEnv(env: Environment) {
    setSelectedEnv(env)
    setMainTab('conexoes')
  }

  return (
    <div className="space-y-6 py-6">
      {/* Breadcrumb */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <Link href="/clientes" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4">
          <ArrowLeft className="w-3 h-3" /> Clientes
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

      {/* Seletor de ambiente (quando estamos em Conexões/Campos/Fluxos) */}
      {selectedEnv && ['conexoes', 'campos', 'fluxos'].includes(mainTab) && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3 p-3 rounded-xl bg-accent/40 border border-border">
          <span className="text-xs text-muted-foreground">Ambiente:</span>
          <div className="relative flex-1 max-w-xs">
            <select
              value={selectedEnv.id}
              onChange={e => {
                const env = tenant?.environments.find(v => v.id === e.target.value)
                if (env) setSelectedEnv(env)
              }}
              className="w-full text-xs rounded-lg border border-border bg-background px-3 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {tenant?.environments.map(env => (
                <option key={env.id} value={env.id}>{env.name} ({env.slug})</option>
              ))}
            </select>
          </div>
          <AlertCircle className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Alterações afetam apenas este ambiente</span>
        </motion.div>
      )}

      {/* Tabs principais */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.5 }}>
        <Tabs value={mainTab} onValueChange={v => { setMainTab(v); if (v === 'ambientes') setSelectedEnv(null) }}>
          <TabsList className="mb-4">
            <TabsTrigger value="dados">Dados</TabsTrigger>
            <TabsTrigger value="ambientes">Ambientes</TabsTrigger>
            <TabsTrigger value="conexoes" disabled={!selectedEnv}>Conexoes</TabsTrigger>
            <TabsTrigger value="campos" disabled={!selectedEnv}>Campos Emarsys</TabsTrigger>
            <TabsTrigger value="fluxos" disabled={!selectedEnv}>Automações</TabsTrigger>
          </TabsList>

          <TabsContent value="dados">
            <DadosTab slug={slug} />
          </TabsContent>

          <TabsContent value="ambientes">
            <AmbientesTab slug={slug} onSelectEnv={handleSelectEnv} />
          </TabsContent>

          <TabsContent value="conexoes">
            {selectedEnv ? <ConexoesTab envId={selectedEnv.id} /> : <p className="text-sm text-muted-foreground py-4">Selecione um ambiente na aba Ambientes.</p>}
          </TabsContent>

          <TabsContent value="campos">
            {selectedEnv ? <CamposTab envId={selectedEnv.id} /> : <p className="text-sm text-muted-foreground py-4">Selecione um ambiente na aba Ambientes.</p>}
          </TabsContent>

          <TabsContent value="fluxos">
            {selectedEnv ? <FluxosTab envId={selectedEnv.id} /> : <p className="text-sm text-muted-foreground py-4">Selecione um ambiente na aba Ambientes.</p>}
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  )
}
