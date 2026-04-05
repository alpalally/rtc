import 'dotenv/config';
import express from 'express';
import { webhookRouter } from './routes/webhooks';
import { reposRouter } from './routes/repos';
import { authRouter } from './routes/auth';
import { eventsRouter } from './routes/events';

const app = express();
const PORT = process.env.API_PORT ?? 3001;

// Raw body needed for GitHub webhook signature verification
app.use('/webhooks', express.raw({ type: 'application/json' }));
app.use(express.json());

app.use('/auth', authRouter);
app.use('/webhooks', webhookRouter);
app.use('/api/repos', reposRouter);
app.use('/api/events', eventsRouter);

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`AgentDocs API listening on port ${PORT}`);
});
