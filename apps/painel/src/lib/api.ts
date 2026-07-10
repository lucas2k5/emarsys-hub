import axios from 'axios'

// Empty string → axios uses relative URLs (Next.js API routes on Vercel)
// Set NEXT_PUBLIC_API_URL=http://localhost:3000 for local dev with real backend
const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? ''

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.error || error.message || 'Erro desconhecido'
    console.error('[API Error]', message, error.config?.url)
    return Promise.reject(new Error(message))
  }
)
