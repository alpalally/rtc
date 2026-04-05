import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { db } from '../db';
import { repos, syncEvents } from '../db/schema';
import { eq, inArray } from 'drizzle-orm';
import { docSyncQueue } from '../lib/queue';
import { trackEvent } from '../lib/analytics';

export const webhookRouter = Router();

interface GithubInstallationRepo {
  id: number;
  name: string;
  full_name: string;
}

function verifySignature(secret: string, payload: Buffer, signature: string): boolean {
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(payload).digest('hex')}`;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

async function upsertInstallationRepos(
  installationId: number,
  githubAccountId: number,
  repoList: GithubInstallationRepo[],
) {
  for (const r of repoList) {
    const [owner, name] = r.full_name.split('/');
    await db.insert(repos).values({
      githubRepoId: r.id,
      installationId,
      githubAccountId,
      owner,
      name,
      defaultBranch: 'main',
    }).onConflictDoUpdate({
      target: repos.githubRepoId,
      set: { installationId, githubAccountId, owner, name, updatedAt: new Date() },
    });
  }
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
  const installationId: number = payload.installation?.id;

  // GitHub App installation events — register or remove repos
  if (event === 'installation') {
    if (payload.action === 'created' && installationId) {
      const githubAccountId: number = payload.installation?.account?.id;
      const orgName: string = payload.installation?.account?.login ?? '';
      const repoList: GithubInstallationRepo[] = payload.repositories ?? [];
      await upsertInstallationRepos(installationId, githubAccountId, repoList);
      await trackEvent('app_installed', {
        metadata: {
          tester_id: String(githubAccountId),
          org_name: orgName,
          repo_count: repoList.length,
          installed_at: new Date().toISOString(),
        },
      });
    } else if (payload.action === 'deleted' && installationId) {
      // Remove all repos for this installation
      const existing = await db.select({ githubRepoId: repos.githubRepoId })
        .from(repos)
        .where(eq(repos.installationId, installationId));
      if (existing.length > 0) {
        await db.delete(repos).where(
          inArray(repos.githubRepoId, existing.map((r) => r.githubRepoId)),
        );
      }
    }
    return;
  }

  if (event === 'installation_repositories') {
    if (payload.action === 'added' && installationId) {
      const githubAccountId: number = payload.installation?.account?.id;
      const repoList: GithubInstallationRepo[] = payload.repositories_added ?? [];
      await upsertInstallationRepos(installationId, githubAccountId, repoList);
    } else if (payload.action === 'removed' && installationId) {
      const removed: GithubInstallationRepo[] = payload.repositories_removed ?? [];
      if (removed.length > 0) {
        await db.delete(repos).where(
          inArray(repos.githubRepoId, removed.map((r) => r.id)),
        );
      }
    }
    return;
  }

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

    await trackEvent('push_received', {
      repoId: repo.id,
      metadata: {
        tester_id: String(payload.installation?.account?.id ?? payload.sender?.id ?? ''),
        branch: (payload.ref as string)?.replace('refs/heads/', '') ?? '',
        commit_sha: payload.after as string ?? '',
        pushed_at: new Date().toISOString(),
      },
    });

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
