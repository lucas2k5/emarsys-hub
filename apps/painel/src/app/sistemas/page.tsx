'use client'
import { motion } from 'framer-motion'
import Image from 'next/image'
import { Blocks, CheckCircle2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/dashboard/PageHeader'

type Integration = {
  name: string
  description: string
  logo: string
  status: 'native' | 'soon'
  features: string[]
}

// Catálogo de plataformas — Emarsys é a integração nativa; as demais entram
// no roadmap como conectores futuros.
const INTEGRATIONS: Integration[] = [
  {
    name: 'SAP Emarsys',
    description: 'Integração nativa completa: produtos, pedidos, contatos com dedupe e wishlist — VTEX → Emarsys de ponta a ponta.',
    logo: '/brands/emarsys.png',
    status: 'native',
    features: ['Catálogo via SFTP', 'Sales Data API', 'Contacts API v3 com dedupe', 'Wishlist incremental'],
  },
  {
    name: 'Salesforce Marketing Cloud',
    description: 'Sincronização de contatos, jornadas e eventos de venda para o Marketing Cloud.',
    logo: '/brands/salesforce.svg',
    status: 'soon',
    features: ['Contatos e listas', 'Journey Builder events', 'Data Extensions'],
  },
  {
    name: 'HubSpot',
    description: 'Contatos, negócios e eventos de e-commerce direto no CRM da HubSpot.',
    logo: '/brands/hubspot.svg',
    status: 'soon',
    features: ['Contacts API', 'E-commerce events', 'Workflows'],
  },
  {
    name: 'Klaviyo',
    description: 'Perfis, eventos e catálogo para campanhas e automações no Klaviyo.',
    logo: '/brands/klaviyo.png',
    status: 'soon',
    features: ['Profiles API', 'Catalog sync', 'Metrics/events'],
  },
]

export default function SistemasPage() {
  return (
    <div className="py-6 max-w-[1600px] mx-auto">
      <PageHeader
        title="Sistemas"
        subtitle="Plataformas de marketing disponíveis para integração"
        icon={Blocks}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {INTEGRATIONS.map((integration, i) => {
          const isNative = integration.status === 'native'
          return (
            <motion.div
              key={integration.name}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 + i * 0.06, duration: 0.4 }}
              className={`p-6 rounded-2xl border bg-card ${isNative ? 'border-primary/30 glow-primary' : 'border-border'}`}
            >
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-xl border flex items-center justify-center bg-white p-2 ${isNative ? 'border-primary/30' : 'border-border'}`}>
                    <Image src={integration.logo} alt={`Logo ${integration.name}`} width={28} height={28} className="w-7 h-7 object-contain" unoptimized />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{integration.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {isNative ? 'Disponível agora' : 'No roadmap'}
                    </p>
                  </div>
                </div>
                {isNative ? (
                  <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 shrink-0">
                    <CheckCircle2 className="w-3 h-3 mr-1" aria-hidden="true" /> Nativa
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-border text-muted-foreground shrink-0">Em breve</Badge>
                )}
              </div>

              <p className="text-sm text-muted-foreground mb-4">{integration.description}</p>

              <div className="flex flex-wrap gap-1.5">
                {integration.features.map(feature => (
                  <span
                    key={feature}
                    className={`text-xs px-2 py-0.5 rounded-md border ${isNative ? 'border-primary/20 bg-primary/5 text-foreground/80' : 'border-border bg-secondary/50 text-muted-foreground'}`}
                  >
                    {feature}
                  </span>
                ))}
              </div>
            </motion.div>
          )
        })}
      </div>

      <motion.p
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
        className="text-xs text-muted-foreground mt-6"
      >
        Quer prioridade em alguma integração? As plataformas do roadmap são habilitadas conforme demanda dos clientes.
      </motion.p>
    </div>
  )
}
