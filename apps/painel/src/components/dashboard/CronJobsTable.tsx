'use client'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/utils'
import type { CronJob } from '@/types/api'

type Props = { jobs: CronJob[] | undefined; loading?: boolean }

export function CronJobsTable({ jobs, loading }: Props) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  if (!jobs?.length) {
    return <p className="text-sm text-muted-foreground py-4">Nenhum job encontrado</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">Job</th>
            <th className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">Schedule</th>
            <th className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">Última execução</th>
            <th className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">Próxima</th>
            <th className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.name} className="border-b border-border hover:bg-accent/30 transition-colors">
              <td className="py-2.5 px-3 font-mono text-xs text-foreground">{job.name}</td>
              <td className="py-2.5 px-3 font-mono text-xs text-muted-foreground">{job.schedule}</td>
              <td className="py-2.5 px-3 text-xs text-muted-foreground">{formatDate(job.lastRun)}</td>
              <td className="py-2.5 px-3 text-xs text-muted-foreground">{formatDate(job.nextRun)}</td>
              <td className="py-2.5 px-3">
                <Badge
                  variant="outline"
                  className={
                    job.running
                      ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
                      : 'border-border text-muted-foreground'
                  }
                >
                  {job.running ? 'Ativo' : 'Inativo'}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
