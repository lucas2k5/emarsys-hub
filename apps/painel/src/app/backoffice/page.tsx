'use client'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ShieldCheck, UserPlus, Trash2, Loader2, Eye, KeyRound } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { PageHeader } from '@/components/dashboard/PageHeader'
import { ChartCard } from '@/components/dashboard/ChartCard'
import { useAuth } from '@/providers/AuthProvider'
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser, type PanelUser } from '@/hooks/useUsers'
import { formatDate } from '@/lib/utils'

const createUserSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  role: z.enum(['admin', 'viewer']),
})

type CreateUserForm = z.infer<typeof createUserSchema>

const ROLE_BADGE: Record<PanelUser['role'], { cls: string; label: string }> = {
  admin: { cls: 'border-primary/30 text-primary bg-primary/10', label: 'Administrador' },
  viewer: { cls: 'border-border text-muted-foreground bg-secondary/50', label: 'Visualização' },
}

function UserRow({ user, isSelf }: { user: PanelUser; isSelf: boolean }) {
  const updateUser = useUpdateUser()
  const deleteUser = useDeleteUser()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [showPasswordField, setShowPasswordField] = useState(false)
  const badge = ROLE_BADGE[user.role]

  return (
    <>
      <tr className="border-b border-border last:border-0 hover:bg-secondary/30 transition-colors">
        <td className="py-3 px-2">
          <p className="text-sm font-medium text-foreground">{user.email}{isSelf && <span className="text-xs text-muted-foreground ml-2">(você)</span>}</p>
          <p className="text-xs text-muted-foreground">criado em {formatDate(user.createdAt)}</p>
        </td>
        <td className="py-3 px-2">
          <Badge variant="outline" className={badge.cls}>{badge.label}</Badge>
        </td>
        <td className="py-3 px-2">
          <select
            className="text-xs rounded-lg border border-border bg-background px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            value={user.role}
            disabled={updateUser.isPending}
            onChange={e => updateUser.mutate({ id: user.id, role: e.target.value as PanelUser['role'] })}
            aria-label={`Papel de ${user.email}`}
          >
            <option value="admin">Administrador</option>
            <option value="viewer">Visualização</option>
          </select>
        </td>
        <td className="py-3 px-2">
          <div className="flex items-center gap-2 justify-end">
            <Button
              size="sm" variant="ghost" className="h-8 gap-1.5 text-xs"
              onClick={() => setShowPasswordField(v => !v)}
            >
              <KeyRound className="w-3.5 h-3.5" aria-hidden="true" /> Senha
            </Button>
            <Button
              size="sm" variant="ghost"
              className="h-8 gap-1.5 text-xs text-rose-400 hover:bg-rose-500/10"
              disabled={isSelf || deleteUser.isPending}
              title={isSelf ? 'Não é possível excluir a própria conta' : 'Excluir usuário'}
              onClick={() => setConfirmDelete(true)}
            >
              {deleteUser.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />}
              Excluir
            </Button>
          </div>
        </td>
      </tr>
      {showPasswordField && (
        <tr className="border-b border-border">
          <td colSpan={4} className="py-2 px-2">
            <div className="flex items-center gap-2 max-w-md">
              <Input
                type="password"
                placeholder="Nova senha (mín. 8 caracteres)"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="border-border bg-accent h-8 text-sm"
              />
              <Button
                size="sm" className="h-8"
                disabled={newPassword.length < 8 || updateUser.isPending}
                onClick={async () => {
                  await updateUser.mutateAsync({ id: user.id, password: newPassword })
                  setNewPassword('')
                  setShowPasswordField(false)
                }}
              >
                {updateUser.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Salvar'}
              </Button>
            </div>
            {updateUser.error && <p className="text-xs text-rose-400 mt-1">{updateUser.error.message}</p>}
          </td>
        </tr>
      )}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir usuário</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Excluir <strong className="text-foreground">{user.email}</strong>? O acesso é revogado imediatamente. Não dá pra desfazer.
          </p>
          {deleteUser.error && <p className="text-xs text-rose-400">{deleteUser.error.message}</p>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
            <Button
              variant="outline" className="border-rose-500/40 text-rose-400 hover:bg-rose-500/10 gap-1.5"
              disabled={deleteUser.isPending}
              onClick={async () => {
                await deleteUser.mutateAsync(user.id)
                setConfirmDelete(false)
              }}
            >
              {deleteUser.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" aria-hidden="true" />}
              Confirmar exclusão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default function BackofficePage() {
  const { user: me } = useAuth()
  const { data: users, isLoading, error } = useUsers()
  const createUser = useCreateUser()
  const [dialogOpen, setDialogOpen] = useState(false)

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<CreateUserForm>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { role: 'viewer' },
  })

  async function onSubmit(values: CreateUserForm) {
    await createUser.mutateAsync(values)
    reset()
    setDialogOpen(false)
  }

  // Viewer não administra usuários — a API já bloqueia; aqui é só UX honesta
  if (me && me.role !== 'admin') {
    return (
      <div className="py-6 max-w-[1600px] mx-auto">
        <PageHeader title="Administração" subtitle="Administração de usuários do painel" icon={ShieldCheck} />
        <div className="p-8 rounded-2xl border border-border bg-card flex flex-col items-center gap-3 text-center">
          <Eye className="w-10 h-10 text-muted-foreground/50" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">Seu perfil é somente visualização</p>
          <p className="text-xs text-muted-foreground max-w-sm">
            A administração de usuários é restrita a administradores. Fale com um admin do painel se precisar de acesso.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="py-6 max-w-[1600px] mx-auto">
      <PageHeader title="Administração" subtitle="Administração de usuários e papéis de acesso" icon={ShieldCheck} />

      <ChartCard
        title="Usuários do painel"
        subtitle="Administradores têm acesso total; visualização apenas consulta e busca"
        action={
          <Button size="sm" className="gap-1.5 h-8" onClick={() => setDialogOpen(true)}>
            <UserPlus className="w-3.5 h-3.5" aria-hidden="true" /> Novo usuário
          </Button>
        }
      >
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
        ) : error ? (
          <p className="text-sm text-rose-400 py-4">{error.message}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="pb-3 px-2 font-medium">Usuário</th>
                  <th className="pb-3 px-2 font-medium">Papel</th>
                  <th className="pb-3 px-2 font-medium">Alterar papel</th>
                  <th className="pb-3 px-2 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {(users ?? []).map(u => (
                  <UserRow key={u.id} user={u} isSelf={u.id === me?.id} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo usuário</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="space-y-1">
              <label htmlFor="newUserEmail" className="text-sm font-medium text-foreground">Email</label>
              <Input id="newUserEmail" type="email" placeholder="pessoa@empresa.com" className="border-border bg-accent" aria-invalid={!!errors.email} {...register('email')} />
              {errors.email && <p className="text-xs text-rose-400">{errors.email.message}</p>}
            </div>
            <div className="space-y-1">
              <label htmlFor="newUserPassword" className="text-sm font-medium text-foreground">Senha</label>
              <Input id="newUserPassword" type="password" placeholder="Mínimo 8 caracteres" className="border-border bg-accent" aria-invalid={!!errors.password} {...register('password')} />
              {errors.password && <p className="text-xs text-rose-400">{errors.password.message}</p>}
            </div>
            <div className="space-y-1">
              <label htmlFor="newUserRole" className="text-sm font-medium text-foreground">Papel</label>
              <select
                id="newUserRole"
                className="w-full text-sm rounded-xl border border-border bg-accent px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                {...register('role')}
              >
                <option value="viewer">Visualização — consulta e busca apenas</option>
                <option value="admin">Administrador — acesso total</option>
              </select>
            </div>
            {createUser.error && (
              <div className="px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20">
                <p className="text-xs text-rose-400">{createUser.error.message}</p>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting || createUser.isPending} className="gap-1.5">
                {(isSubmitting || createUser.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" aria-hidden="true" />}
                Criar usuário
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
