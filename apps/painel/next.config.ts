import type { NextConfig } from 'next'

/**
 * Proxy da API pelo próprio origin do painel.
 *
 * Em produção na Vercel, painel e API vivem em subdomínios distintos de
 * vercel.app — que está na Public Suffix List, então são SITES diferentes e o
 * cookie de sessão (SameSite=Lax) não cruzaria. Com o proxy, o browser só
 * fala com o origin do painel (cookie first-party) e o Next repassa
 * server-side para a API.
 *
 * beforeFiles: obrigatório — os route handlers de mock em src/app/api/**
 * venceriam o rewrite se ele rodasse depois do filesystem.
 *
 * Configure API_PROXY_TARGET (ex: https://emarsys-hub-api.vercel.app) e
 * NEXT_PUBLIC_API_URL vazio (axios usa URLs relativas → mesmo origin).
 * Em dev local sem API_PROXY_TARGET, nada muda (mock/API local seguem valendo).
 */
const nextConfig: NextConfig = {
  async rewrites() {
    const target = process.env.API_PROXY_TARGET
    if (!target) return []
    return {
      beforeFiles: ['/api/:path*', '/auth/:path*', '/health', '/webhooks/:path*'].map((source) => ({
        source,
        destination: `${target}${source}`,
      })),
    }
  },
}

export default nextConfig
