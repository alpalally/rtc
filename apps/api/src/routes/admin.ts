import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { db } from '../db';
import { analyticsEvents, docFeedback, docs, repos } from '../db/schema';
import { eq, sql, desc } from 'drizzle-orm';

export const adminRouter = Router();

adminRouter.get('/metrics', async (_req, res) => {
  try {
  const rows = await db
    .select({ eventType: analyticsEvents.eventType, count: sql<number>`count(*)::int` })
    .from(analyticsEvents)
    .groupBy(analyticsEvents.eventType);

  const counts: Record<string, number> = {
    app_installed: 0,
    push_received: 0,
    doc_generated: 0,
    doc_viewed: 0,
    feedback_clicked: 0,
  };

  for (const row of rows) {
    counts[row.eventType] = row.count;
  }

  // Count only successful doc_generated events for pipeline reliability
  const [successRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(analyticsEvents)
    .where(sql`event_type = 'doc_generated' AND metadata->>'success' = 'true'`);

  const docsGeneratedSuccess = successRow?.count ?? 0;

  const pushToViewRate = counts.push_received > 0
    ? (counts.doc_viewed / counts.push_received * 100).toFixed(1)
    : null;

  const pipelineReliability = counts.push_received > 0
    ? (docsGeneratedSuccess / counts.push_received * 100).toFixed(1)
    : null;

  res.json({
    app_installed: counts.app_installed,
    push_received: counts.push_received,
    doc_generated: counts.doc_generated,
    doc_generated_success: docsGeneratedSuccess,
    doc_viewed: counts.doc_viewed,
    feedback_clicked: counts.feedback_clicked,
    push_to_view_rate_pct: pushToViewRate ? Number(pushToViewRate) : null,
    pipeline_reliability_pct: pipelineReliability ? Number(pipelineReliability) : null,
  });
  } catch (err) {
    console.error('metrics error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// Temporary E2E test endpoint — generates real docs for a small set of inline files
// and stores them in the DB so the full read-back flow can be validated.
// DELETE this endpoint after testing is complete.
adminRouter.post('/e2e-test', async (_req, res) => {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Inline file content sampled from the actual source tree
  const testFiles: Array<{ filePath: string; content: string }> = [
    {
      filePath: 'src/lib/analytics.ts',
      content: `import { db } from '../db';
import { analyticsEvents } from '../db/schema';

export type EventType = 'app_installed' | 'push_received' | 'doc_generated' | 'doc_viewed' | 'feedback_clicked';

export async function trackEvent(
  eventType: EventType,
  opts: { repoId?: string; docId?: string; userId?: string; metadata?: Record<string, unknown>; } = {},
): Promise<void> {
  await db.insert(analyticsEvents).values({
    eventType,
    repoId: opts.repoId ?? null,
    docId: opts.docId ?? null,
    userId: opts.userId ?? null,
    metadata: opts.metadata ?? null,
  });
}`,
    },
    {
      filePath: 'src/lib/queue.ts',
      content: `import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export interface DocSyncJob {
  repoId: string; commitSha: string; changedFiles: string[];
  installationId: number; owner: string; name: string;
}

export const docSyncQueue = new Queue<DocSyncJob>('doc-sync', { connection });`,
    },
  ];

  let testRepoId: string | undefined;
  try {
    // 1. Create test repo
    const [testRepo] = await db.insert(repos).values({
      githubRepoId: 999999998,
      installationId: 0,
      githubAccountId: 0,
      owner: 'alpalally',
      name: 'rtc-e2e-test',
      defaultBranch: 'main',
      config: { filePatterns: ['**/*.ts'], docStyle: 'concise', targetBranch: 'main' },
    }).onConflictDoUpdate({
      target: repos.githubRepoId,
      set: { name: 'rtc-e2e-test', updatedAt: new Date() },
    }).returning();
    testRepoId = testRepo.id;

    // 2. Generate docs with Claude
    const generatedDocs: Array<{ filePath: string; docPath: string; content: string }> = [];
    for (const file of testFiles) {
      const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: `Generate concise technical documentation for this file. Include: purpose, exports/functions, usage examples where relevant.\n\nFile: ${file.filePath}\n\`\`\`\n${file.content}\n\`\`\``,
        }],
      });
      const block = message.content[0];
      const docContent = block.type === 'text' ? block.text : '';
      generatedDocs.push({ filePath: file.filePath, docPath: `docs/${file.filePath}.md`, content: docContent });
    }

    // 3. Upsert docs into DB
    const savedDocIds: string[] = [];
    for (const doc of generatedDocs) {
      const [saved] = await db.insert(docs).values({
        repoId: testRepoId,
        filePath: doc.filePath,
        docPath: doc.docPath,
        content: doc.content,
        commitSha: 'e2e-test-sha',
      }).onConflictDoNothing().returning();
      if (saved) savedDocIds.push(saved.id);

      await db.insert(analyticsEvents).values({
        eventType: 'doc_generated',
        repoId: testRepoId,
        docId: saved?.id ?? null,
        metadata: { test: true, success: true, generated_at: new Date().toISOString() },
      });
    }

    // 4. Read back from DB to confirm storage
    const storedDocs = await db.select().from(docs).where(eq(docs.repoId, testRepoId));

    // 5. Cleanup
    await db.delete(analyticsEvents).where(eq(analyticsEvents.repoId, testRepoId));
    await db.delete(docs).where(eq(docs.repoId, testRepoId));
    await db.delete(repos).where(eq(repos.id, testRepoId));

    res.json({
      status: 'pass',
      repoId: testRepoId,
      filesProcessed: testFiles.length,
      docsGenerated: generatedDocs.map(d => ({
        filePath: d.filePath,
        docPath: d.docPath,
        contentLength: d.content.length,
        contentPreview: d.content.slice(0, 300),
      })),
      docsReadBack: storedDocs.map(d => ({
        id: d.id,
        filePath: d.filePath,
        docPath: d.docPath,
        commitSha: d.commitSha,
        contentLength: d.content.length,
      })),
      cleanup: 'done',
    });
  } catch (err) {
    if (testRepoId) {
      try {
        await db.delete(docs).where(eq(docs.repoId, testRepoId));
        await db.delete(analyticsEvents).where(eq(analyticsEvents.repoId, testRepoId));
        await db.delete(repos).where(eq(repos.id, testRepoId));
      } catch (_) { /* best effort */ }
    }
    console.error('e2e-test error:', err);
    res.status(500).json({ status: 'fail', error: (err as Error).message });
  }
});

adminRouter.get('/feedback', async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: docFeedback.id,
        docId: docFeedback.docId,
        filePath: docs.filePath,
        rating: docFeedback.rating,
        comment: docFeedback.comment,
        createdAt: docFeedback.createdAt,
      })
      .from(docFeedback)
      .leftJoin(docs, eq(docFeedback.docId, docs.id))
      .orderBy(desc(docFeedback.createdAt));

    res.json(rows);
  } catch (err) {
    console.error('feedback error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});
