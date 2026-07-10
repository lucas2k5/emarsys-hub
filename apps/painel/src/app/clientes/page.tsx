'use client'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Building2, Loader2, ExternalLink } from 'lucide-react'
import Link from 'next/link'
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
import { useTenants, useCreateTenant } from '@/hooks/useTenants'
import { formatDate } from '@/lib/utils'
import type { Tenant } from '@/types/api'

const createTenantSchema = z.object({
  slug: z
    .string()
    .min(2, 'Mínimo 2 caracteres')
    .max(50, 'Máximo 50 caracteres')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Apenas letras minúsculas, números e hífens (kebab-case)'),
  name: z.string().min(2, 'Mínimo 2 caracteres').max(100, 'Máximo 100 caracteres'),
})

type CreateTenantForm = z.infer<typeof createTenantSchema>

const statusCls: Record<Tenant['status'], string> = {
  active: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10',
  inactive: 'border-border text-muted-foreground',
}

const statusLabel: Record<Tenant['status'], string> = {
  active: 'Ativo',
  inactive: 'Inativo',
}

function CreateTenantDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createTenant = useCreateTenant()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateTenantForm>({
    resolver: zodResolver(createTenantSchema),
  })

  async function onSubmit(values: CreateTenantForm) {
    await createTenant.mutateAsync(values)
    reset()
    onClose()
  }

  function handleClose() {
    reset()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo cliente</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2" noValidate>
          <div className="space-y-1">
            <label htmlFor="slug" className="text-sm font-medium text-foreground">
              Slug <span className="text-xs text-muted-foreground">(identificador único, kebab-case)</span>
            </label>
            <Input
              id="slug"
              placeholder="ex: minha-empresa"
              className="border-border bg-accent font-mono"
              aria-invalid={!!errors.slug}
              {...register('slug')}
            />
            {errors.slug && <p className="text-xs text-red-400">{errors.slug.message}</p>}
          </div>
          <div className="space-y-1">
            <label htmlFor="name" className="text-sm font-medium text-foreground">Nome</label>
            <Input
              id="name"
              placeholder="ex: Minha Empresa S.A."
              className="border-border bg-accent"
              aria-invalid={!!errors.name}
              {...register('name')}
            />
            {errors.name && <p className="text-xs text-red-400">{errors.name.message}</p>}
          </div>
          {createTenant.error && (
            <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <p className="text-sm text-red-400">{createTenant.error.message}</p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={handleClose} className="border-border">
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || createTenant.isPending}>
              {(isSubmitting || createTenant.isPending) ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Criando...</>
              ) : 'Criar cliente'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function ClientesPage() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const { data: tenants, isLoading, error } = useTenants()

  return (
    <div className="space-y-6 py-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-sm text-muted-foreground mt-1">Tenants configurados na plataforma</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Novo cliente
        </Button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.5 }}
        className="p-5 rounded-2xl border border-border bg-card"
      >
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
          </div>
        ) : error ? (
          <div className="flex items-center gap-3 py-8 text-red-400 text-sm">
            <Building2 className="w-5 h-5" />
            Erro ao carregar clientes: {error.message}
          </div>
        ) : !tenants?.length ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-2xl bg-accent border border-border flex items-center justify-center">
              <Building2 className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">Nenhum cliente cadastrado</p>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Criar primeiro cliente
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-accent/30">
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 text-xs text-muted-foreground font-medium">Nome</th>
                  <th className="text-left py-3 px-4 text-xs text-muted-foreground font-medium">Slug</th>
                  <th className="text-left py-3 px-4 text-xs text-muted-foreground font-medium">Status</th>
                  <th className="text-left py-3 px-4 text-xs text-muted-foreground font-medium">Atualizado em</th>
                  <th className="text-left py-3 px-4 text-xs text-muted-foreground font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {tenants.map(tenant => (
                  <tr key={tenant.id} className="border-b border-border hover:bg-accent/30 transition-colors">
                    <td className="py-3 px-4 font-medium text-foreground">{tenant.name}</td>
                    <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{tenant.slug}</td>
                    <td className="py-3 px-4">
                      <Badge variant="outline" className={statusCls[tenant.status]}>
                        {statusLabel[tenant.status]}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-xs text-muted-foreground">{formatDate(tenant.updatedAt)}</td>
                    <td className="py-3 px-4">
                      <Link
                        href={`/clientes/${tenant.slug}`}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Configurar
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      <CreateTenantDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  )
}
