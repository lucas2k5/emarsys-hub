// Entry serverless da Vercel — importa o app Express compilado (dist/).
// O build (`pnpm build`) roda tsc e copia as migrations SQL para dist/db.
import app from '../dist/index.js';

export default app;
