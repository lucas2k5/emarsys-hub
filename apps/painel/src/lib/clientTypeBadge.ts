/**
 * Estilo de badge para client_type (slug do environment — DADO do banco).
 * Cor derivada do próprio valor por hash: distinção visual estável entre
 * environments sem nenhuma marca hardcoded no código.
 */

const BADGE_PALETTE = [
  'border-sky-500/30 text-sky-400 bg-sky-500/10',
  'border-purple-500/30 text-purple-400 bg-purple-500/10',
  'border-emerald-500/30 text-emerald-400 bg-emerald-500/10',
  'border-amber-500/30 text-amber-400 bg-amber-500/10',
]

export function clientTypeBadgeClass(value: string | null | undefined): string {
  const v = value ?? ''
  let h = 0
  for (let i = 0; i < v.length; i++) h = (h * 31 + v.charCodeAt(i)) >>> 0
  return BADGE_PALETTE[h % BADGE_PALETTE.length]
}

export function clientTypeLabel(value: string | null | undefined): string {
  if (!value) return '—'
  return value.charAt(0).toUpperCase() + value.slice(1)
}
