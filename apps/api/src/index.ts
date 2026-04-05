import 'dotenv/config';
import path from 'path';
import express from 'express';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db } from './db';
import { webhookRouter } from './routes/webhooks';
import { reposRouter } from './routes/repos';
import { authRouter } from './routes/auth';
import { eventsRouter } from './routes/events';
import { adminRouter } from './routes/admin';

const app = express();
const PORT = process.env.API_PORT ?? 3001;

// Raw body needed for GitHub webhook signature verification
app.use('/webhooks', express.raw({ type: 'application/json' }));
app.use(express.json());

app.use('/auth', authRouter);
app.use('/webhooks', webhookRouter);
app.use('/api/repos', reposRouter);
app.use('/api/events', eventsRouter);
app.use('/api/admin', adminRouter);

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

async function main() {
  console.log('Running database migrations...');
  await migrate(db, { migrationsFolder: path.join(__dirname, 'db/migrations') });
  console.log('Migrations complete.');

  app.listen(PORT, () => {
    console.log(`AgentDocs API listening on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error('Startup failed:', err);
  process.exit(1);
});
