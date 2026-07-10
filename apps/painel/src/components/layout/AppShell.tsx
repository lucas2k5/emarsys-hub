'use client'
import { usePathname } from 'next/navigation'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { AuthProvider } from '@/providers/AuthProvider'

const NO_SHELL_PATHS = ['/login']

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isShellless = NO_SHELL_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))

  if (isShellless) {
    return <AuthProvider>{children}</AuthProvider>
  }

  return (
    <AuthProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Header />
          <main className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto w-full">
            {children}
          </main>
        </div>
      </div>
    </AuthProvider>
  )
}
