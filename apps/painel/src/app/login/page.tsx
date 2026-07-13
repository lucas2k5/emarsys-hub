'use client'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, Eye, EyeOff, AlertCircle, ArrowRight } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'

// Modo mock: desenvolvimento local sem API configurada.
// Mesma condição do AuthProvider — duplicada aqui pois é client component
// e não há forma de importar uma constante de módulo server-side sem bundle penalty.
const IS_MOCK =
  process.env.NODE_ENV !== 'production' &&
  !process.env.NEXT_PUBLIC_API_URL

const loginSchema = z.object({
  email: z.string().email('Informe um email válido'),
  password: z.string().min(1, 'Informe sua senha'),
})

type LoginForm = z.infer<typeof loginSchema>

const HIGHLIGHTS = [
  'Produtos, pedidos, contatos e wishlist em sincronização contínua',
  'Multi-cliente e multi-ambiente com credenciais isoladas',
  'Trilha de auditoria completa de cada integração',
]

export default function LoginPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  // Em modo mock, a página de login redireciona diretamente para home
  // sem nenhuma interação com a API.
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

  // Em mock, o useEffect já está redirecionando; renderiza skeleton mínimo
  if (IS_MOCK) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-2">
      {/* ── Painel de marca (desktop) ─────────────────────────────────────── */}
      <div className="relative hidden lg:flex flex-col justify-between overflow-hidden border-r border-border p-10">
        {/* Glow radial da identidade — profundidade sem glassmorphism */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 60% 45% at 30% 40%, color-mix(in oklch, var(--primary) 14%, transparent), transparent 70%), radial-gradient(ellipse 40% 30% at 75% 75%, color-mix(in oklch, var(--highlight) 7%, transparent), transparent 70%)',
          }}
        />

        <div className="relative z-10 flex items-center gap-3">
          <Image src="/logo-wide.png" alt="" width={56} height={32} className="h-8 w-auto" aria-hidden="true" />
          <span className="font-semibold text-foreground tracking-tight">Connect-hub</span>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative z-10 max-w-md"
        >
          <Image
            src="/logo-wide.png"
            alt=""
            width={210}
            height={120}
            className="h-28 w-auto mb-8"
            priority
            aria-hidden="true"
          />
          <h1 className="text-3xl font-bold tracking-tight text-foreground leading-tight [text-wrap:balance]">
            Suas integrações de marketing, em um só lugar
          </h1>
          <ul className="mt-6 space-y-3">
            {HIGHLIGHTS.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-highlight shrink-0" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </motion.div>

        <p className="relative z-10 text-xs text-muted-foreground/70">
          Connect-hub · Plataforma multi-tenant de integrações
        </p>
      </div>

      {/* ── Formulário ────────────────────────────────────────────────────── */}
      <div className="flex min-h-screen lg:min-h-0 items-center justify-center px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="w-full max-w-sm"
        >
          {/* Logo no mobile (o painel de marca some) */}
          <div className="lg:hidden flex flex-col items-center gap-2 mb-8">
            <Image src="/logo-wide.png" alt="Connect-hub" width={126} height={72} className="h-16 w-auto" priority />
            <p className="font-semibold text-foreground">Connect-hub</p>
          </div>

          <div className="mb-8 hidden lg:block">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Bem-vindo de volta</h2>
            <p className="text-sm text-muted-foreground mt-1.5">Entre com sua conta para acessar o painel</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium text-foreground">Email</label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                placeholder="voce@empresa.com"
                className="h-11 border-border bg-accent"
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'email-error' : undefined}
                {...register('email')}
              />
              {errors.email && (
                <p id="email-error" className="flex items-center gap-1.5 text-xs text-rose-400">
                  <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
                  {errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium text-foreground">Senha</label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Sua senha"
                  className="h-11 border-border bg-accent pr-11"
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? 'password-error' : undefined}
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                </button>
              </div>
              {errors.password && (
                <p id="password-error" className="flex items-center gap-1.5 text-xs text-rose-400">
                  <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
                  {errors.password.message}
                </p>
              )}
            </div>

            {serverError && (
              <div role="alert" className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="text-sm text-rose-400 font-medium">Não foi possível entrar</p>
                  <p className="text-xs text-rose-400/80 mt-0.5">{serverError}</p>
                </div>
              </div>
            )}

            <Button type="submit" className="w-full h-11 gap-2 font-medium" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  Entrando...
                </>
              ) : (
                <>
                  Entrar
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </>
              )}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground/70 text-center mt-8">
            Acesso restrito. Precisa de uma conta? Fale com um administrador.
          </p>
        </motion.div>
      </div>
    </div>
  )
}
