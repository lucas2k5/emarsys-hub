/**
 * Trabalho em background compatível com serverless.
 *
 * Em processo contínuo (VPS/dev), fire-and-forget simples. Na Vercel, a
 * função congela após a resposta — waitUntil mantém a invocação viva até a
 * promise terminar (dentro do maxDuration configurado).
 */

export function runInBackground(task: () => Promise<unknown>, label: string): void {
  const promise = Promise.resolve()
    .then(task)
    .catch((err) => console.error(`❌ [bg:${label}]`, err instanceof Error ? err.message : err));

  if (process.env.VERCEL) {
    import('@vercel/functions')
      .then(({ waitUntil }) => waitUntil(promise))
      .catch(() => {
        /* fora do runtime Vercel — promise já está rodando */
      });
  }
}
