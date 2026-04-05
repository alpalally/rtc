import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { db } from '../db';
import { repos, syncEvents } from '../db/schema';
import { eq } from 'drizzle-orm';
import { docSyncQueue } from '../lib/queue';

export const webhookRouter = Router();

function verifySignature(secret: string, payload: Buffer, signature: string): boolean {
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(payload).digest('hex')}`;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

webhookRouter.post('/github', async (req: Request, res: Response) => {
  const sig = req.headers['x-hub-signature-256'];
  const event = req.headers['x-github-event'];
  const body = req.body as Buffer;

  if (!sig || typeof sig !== 'string') {
    res.status(401).json({ error: 'Missing signature' });
    return;
  }

  const secret = process.env.GITHUB_WEBHOOK_SECRET!;
  if (!verifySignature(secret, body, sig)) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  res.status(200).json({ ok: true });

  const payload = JSON.parse(body.toString());

  if (event === 'push') {
    const repoGithubId = payload.repository?.id;
    if (!repoGithubId) return;

    const [repo] = await db.select().from(repos).where(eq(repos.githubRepoId, repoGithubId));
    if (!repo) return;

    const changedFiles: string[] = [
      ...(payload.commits ?? []).flatMap((c: { added: string[]; modified: string[] }) => [
        ...c.added,
        ...c.modified,
      ]),
    ];

    const [event_] = await db.insert(syncEvents).values({
      repoId: repo.id,
      commitSha: payload.after,
      status: 'queued',
      triggeredBy: 'push',
      filesChanged: changedFiles,
    }).returning();

    await docSyncQueue.add('sync', {
      repoId: repo.id,
      commitSha: payload.after,
      changedFiles,
      installationId: Number(repo.installationId),
      owner: repo.owner,
      name: repo.name,
    }, { jobId: event_.id });
  }
});
