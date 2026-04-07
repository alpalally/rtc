import { Router } from 'express';
import { db } from '../db';
import { repos, docs, syncEvents, docFeedback } from '../db/schema';
import { eq } from 'drizzle-orm';
import { docSyncQueue } from '../lib/queue';
import { trackEvent } from '../lib/analytics';

export const reposRouter = Router();

reposRouter.get('/', async (req, res) => {
  try {
    const githubUserIdHeader = req.headers['x-github-user-id'];
    if (!githubUserIdHeader) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const githubAccountId = Number(githubUserIdHeader);
    const all = await db.select().from(repos).where(eq(repos.githubAccountId, githubAccountId));
    res.json(all);
  } catch (err) {
    console.error('GET /repos error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

reposRouter.get('/:repoId', async (req, res) => {
  try {
    const [repo] = await db.select().from(repos).where(eq(repos.id, req.params.repoId));
    if (!repo) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(repo);
  } catch (err) {
    console.error('GET /repos/:repoId error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

reposRouter.patch('/:repoId', async (req, res) => {
  try {
    const [updated] = await db.update(repos)
      .set({ config: req.body.config, updatedAt: new Date() })
      .where(eq(repos.id, req.params.repoId))
      .returning();
    res.json(updated);
  } catch (err) {
    console.error('PATCH /repos/:repoId error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

reposRouter.delete('/:repoId', async (req, res) => {
  try {
    await db.delete(repos).where(eq(repos.id, req.params.repoId));
    res.status(204).end();
  } catch (err) {
    console.error('DELETE /repos/:repoId error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

reposRouter.get('/:repoId/docs', async (req, res) => {
  try {
    const all = await db.select().from(docs).where(eq(docs.repoId, req.params.repoId));
    res.json(all);
  } catch (err) {
    console.error('GET /repos/:repoId/docs error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

reposRouter.get('/:repoId/docs/:docId', async (req, res) => {
  try {
    const [doc] = await db.select().from(docs).where(eq(docs.id, req.params.docId));
    if (!doc) { res.status(404).json({ error: 'Not found' }); return; }
    const viewerId = req.headers['x-viewer-id'] as string | undefined
      ?? req.headers['x-github-user-id'] as string | undefined
      ?? 'anon';
    await trackEvent('doc_viewed', {
      repoId: req.params.repoId,
      docId: req.params.docId,
      metadata: {
        viewer_id: viewerId,
        viewed_at: new Date().toISOString(),
        referrer: req.headers.referer ?? null,
      },
    });
    res.json(doc);
  } catch (err) {
    console.error('GET /repos/:repoId/docs/:docId error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

reposRouter.post('/:repoId/docs/:docId/feedback', async (req, res) => {
  try {
    const { rating, comment } = req.body;
    if (rating !== 'up' && rating !== 'down') {
      res.status(400).json({ error: 'rating must be "up" or "down"' });
      return;
    }
    const [doc] = await db.select().from(docs).where(eq(docs.id, req.params.docId));
    if (!doc) { res.status(404).json({ error: 'Not found' }); return; }

    const [feedback] = await db.insert(docFeedback).values({
      docId: req.params.docId,
      rating,
      comment: comment ?? null,
    }).returning();

    const viewerId = req.headers['x-viewer-id'] as string | undefined
      ?? req.headers['x-github-user-id'] as string | undefined
      ?? 'anon';
    await trackEvent('feedback_clicked', {
      repoId: req.params.repoId,
      docId: req.params.docId,
      metadata: {
        viewer_id: viewerId,
        sentiment: rating,
        clicked_at: new Date().toISOString(),
      },
    });

    res.status(201).json(feedback);
  } catch (err) {
    console.error('POST /repos/:repoId/docs/:docId/feedback error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

reposRouter.post('/:repoId/sync', async (req, res) => {
  try {
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
  } catch (err) {
    console.error('POST /repos/:repoId/sync error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

reposRouter.get('/:repoId/events', async (req, res) => {
  try {
    const events = await db.select().from(syncEvents).where(eq(syncEvents.repoId, req.params.repoId));
    res.json(events);
  } catch (err) {
    console.error('GET /repos/:repoId/events error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});
