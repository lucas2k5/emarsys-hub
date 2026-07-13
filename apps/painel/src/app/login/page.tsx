'use client'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Building2, Mail, Lock, ArrowRight, Shield, Zap, RefreshCw, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'

// Modo mock: desenvolvimento local sem API configurada.
const IS_MOCK =
  process.env.NODE_ENV !== 'production' &&
  !process.env.NEXT_PUBLIC_API_URL

const loginSchema = z.object({
  email: z.string().email('Informe um email válido'),
  password: z.string().min(1, 'Informe sua senha'),
})

type LoginForm = z.infer<typeof loginSchema>

const FEATURES = [
  { icon: Zap, title: 'Automação em tempo real', desc: 'Webhooks, filas com retry e dedupe inteligente' },
  { icon: Shield, title: 'Isolamento por ambiente', desc: 'Credenciais criptografadas AES-256-GCM por tenant' },
  { icon: RefreshCw, title: 'Scroll incremental', desc: 'Checkpoints que nunca perdem dados' },
]

export default function LoginPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)
  const [showPwd, setShowPwd] = useState(false)
  const [accessHint, setAccessHint] = useState(false)

  useEffect(() => {
    if (IS_MOCK) {
      router.replace('/')
    }
  }, [router])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  async function onSubmit(values: LoginForm) {
    setServerError(null)
    try {
      await api.post('/auth/login', values)
      // O AuthProvider cacheia o 401 pré-login ('auth-me') e nunca desmonta —
      // sem invalidar, a home veria o cache "não autenticado" e voltaria pro login.
      await queryClient.invalidateQueries({ queryKey: ['auth-me'] })
      router.push('/')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Credenciais inválidas'
      setServerError(msg)
    }
  }

  if (IS_MOCK) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left — Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-12 overflow-hidden bg-gradient-to-br from-[#0a1430] via-[#0a0e1a] to-[#0a0e1a]">
        {/* Decorative glow orbs */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/20 rounded-full blur-[120px]" aria-hidden="true" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-highlight/10 rounded-full blur-[100px]" aria-hidden="true" />
        <div className="absolute top-1/3 left-1/4 w-64 h-64 bg-violet-600/10 rounded-full blur-[100px]" aria-hidden="true" />

        {/* Grid overlay */}
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(hsl(0 0% 100%) 1px, transparent 1px), linear-gradient(90deg, hsl(0 0% 100%) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl overflow-hidden glow-primary shrink-0">
              <Image src="/logo-mark.png" alt="Connect-Hub" width={48} height={48} className="w-full h-full object-cover" priority />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight">Connect-Hub</span>
              <p className="text-xs text-muted-foreground -mt-0.5">Plataforma de integrações</p>
            </div>
          </div>
        </div>

        <div className="relative z-10 max-w-md">
          <h1 className="text-4xl font-bold leading-tight tracking-tight">
            Sincronização <span className="bg-gradient-to-r from-primary to-highlight bg-clip-text text-transparent">multi-tenant</span> sem fricção.
          </h1>
          <p className="text-muted-foreground mt-4 text-lg leading-relaxed">
            Uma única plataforma para integrar catálogo, pedidos, contatos e wishlist de N clientes — 100% configurável, sem clonar repositório.
          </p>

          <div className="grid grid-cols-1 gap-3 mt-8">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <f.icon className="w-4.5 h-4.5 text-primary" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-medium">{f.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 text-xs text-muted-foreground">
          © 2026 Connect-Hub · Todos os direitos reservados
        </div>
      </div>

      {/* Right — Login Form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-2.5 mb-8 justify-center">
            <div className="w-10 h-10 rounded-xl overflow-hidden glow-primary shrink-0">
              <Image src="/logo-mark.png" alt="Connect-Hub" width={40} height={40} className="w-full h-full object-cover" priority />
            </div>
            <span className="text-lg font-bold tracking-tight">Connect-Hub</span>
          </div>

          <div className="mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 mb-4">
              <Building2 className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
              <span className="text-xs text-primary font-medium">Portal B2B</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight">Acessar painel</h2>
            <p className="text-sm text-muted-foreground mt-1">Entre com suas credenciais corporativas</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <div>
              <label htmlFor="email" className="text-xs text-muted-foreground">Email corporativo</label>
              <div className="relative mt-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  placeholder="voce@empresa.com"
                  className="pl-10 bg-background/50 h-11"
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? 'email-error' : undefined}
                  {...register('email')}
                />
              </div>
              {errors.email && (
                <p id="email-error" className="flex items-center gap-1.5 text-xs text-rose-400 mt-1.5">
                  <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
                  {errors.email.message}
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-xs text-muted-foreground">Senha</label>
                <button
                  type="button"
                  onClick={() => setAccessHint(v => !v)}
                  className="text-xs text-primary hover:underline"
                >
                  Esqueceu a senha?
                </button>
              </div>
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="password"
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••••"
                  className="pl-10 pr-14 bg-background/50 h-11"
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? 'password-error' : undefined}
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                  aria-label={showPwd ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPwd ? 'Ocultar' : 'Ver'}
                </button>
              </div>
              {errors.password && (
                <p id="password-error" className="flex items-center gap-1.5 text-xs text-rose-400 mt-1.5">
                  <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
                  {errors.password.message}
                </p>
              )}
            </div>

            {accessHint && (
              <div className="px-4 py-3 rounded-xl bg-primary/5 border border-primary/15">
                <p className="text-xs text-muted-foreground">
                  A redefinição de senha é feita por um <span className="text-foreground font-medium">administrador do painel</span> em Administração → Usuários. Fale com o responsável pela sua conta.
                </p>
              </div>
            )}

            {serverError && (
              <div role="alert" className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="text-sm text-rose-400 font-medium">Não foi possível entrar</p>
                  <p className="text-xs text-rose-400/80 mt-0.5">{serverError}</p>
                </div>
              </div>
            )}

            <Button type="submit" disabled={isSubmitting} className="w-full h-11 text-sm font-medium">
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" aria-hidden="true" />
                  Autenticando...
                </>
              ) : (
                <>
                  Entrar
                  <ArrowRight className="w-4 h-4 ml-2" aria-hidden="true" />
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-border">
            <p className="text-xs text-muted-foreground text-center">
              Ainda não tem acesso?{' '}
              <button type="button" onClick={() => setAccessHint(v => !v)} className="text-primary hover:underline font-medium">
                Solicitar conta B2B
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
