export async function GET() {
  // Envelopado em { jobs } para casar com o shape que useBackgroundJobs espera
  return Response.json({
    jobs: [
      { id: 'job-001', type: 'product-catalog-export', status: 'done',    startedAt: '2026-06-29T06:00:00.000Z', progress: 100 },
      { id: 'job-002', type: 'contact-bulk-retry',     status: 'running', startedAt: '2026-06-29T09:00:00.000Z', progress: 42  },
      { id: 'job-003', type: 'product-catalog-export', status: 'done',    startedAt: '2026-06-28T06:00:00.000Z', progress: 100 },
      { id: 'job-004', type: 'order-reprocess',        status: 'failed',  startedAt: '2026-06-28T19:10:00.000Z', progress: 17  },
    ],
  })
}
