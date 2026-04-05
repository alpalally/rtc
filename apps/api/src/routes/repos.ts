import { Router } from 'express';
import { db } from '../db';
import { repos, docs, syncEvents } from '../db/schema';
import { eq } from 'drizzle-orm';
import { docSyncQueue } from '../lib/queue';

export const reposRouter = Router();

reposRouter.get('/', async (req, res) => {
  const githubUserIdHeader = req.headers['x-github-user-id'];
  if (!githubUserIdHeader) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const githubAccountId = Number(githubUserIdHeader);
  const all = await db.select().from(repos).where(eq(repos.githubAccountId, githubAccountId));
  res.json(all);
});

reposRouter.get('/:repoId', async (req, res) => {
  const [repo] = await db.select().from(repos).where(eq(repos.id, req.params.repoId));
  if (!repo) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(repo);
});

reposRouter.patch('/:repoId', async (req, res) => {
  const [updated] = await db.update(repos)
    .set({ config: req.body.config, updatedAt: new Date() })
    .where(eq(repos.id, req.params.repoId))
    .returning();
  res.json(updated);
});

reposRouter.delete('/:repoId', async (req, res) => {
  await db.delete(repos).where(eq(repos.id, req.params.repoId));
  res.status(204).end();
});

reposRouter.get('/:repoId/docs', async (req, res) => {
  const all = await db.select().from(docs).where(eq(docs.repoId, req.params.repoId));
  res.json(all);
});

reposRouter.get('/:repoId/docs/:docId', async (req, res) => {
  const [doc] = await db.select().from(docs).where(eq(docs.id, req.params.docId));
  if (!doc) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(doc);
});

reposRouter.post('/:repoId/sync', async (req, res) => {
  const [repo] = await db.select().from(repos).where(eq(repos.id, req.params.repoId));
  if (!repo) { res.status(404).json({ error: 'Not found' }); return; }

  const [event] = await db.insert(syncEvents).values({
    repoId: repo.id,
    commitSha: 'manual',
    status: 'queued',
    triggeredBy: 'manual',
    filesChanged: [],
  }).returning();

  await docSyncQueue.add('sync', {
    repoId: repo.id,
    commitSha: 'HEAD',
    changedFiles: [],
    installationId: Number(repo.installationId),
    owner: repo.owner,
    name: repo.name,
  }, { jobId: event.id });

  res.json({ eventId: event.id });
});

reposRouter.get('/:repoId/events', async (req, res) => {
  const events = await db.select().from(syncEvents).where(eq(syncEvents.repoId, req.params.repoId));
  res.json(events);
});
