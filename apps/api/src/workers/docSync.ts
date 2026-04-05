import { Worker } from 'bullmq';
import Anthropic from '@anthropic-ai/sdk';
import { App } from '@octokit/app';
import { db } from '../db';
import { docs, syncEvents } from '../db/schema';
import { eq } from 'drizzle-orm';
import { connection, DocSyncJob } from '../lib/queue';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const githubApp = new App({
  appId: process.env.GITHUB_APP_ID!,
  privateKey: process.env.GITHUB_APP_PRIVATE_KEY!.replace(/\\n/g, '\n'),
  webhooks: { secret: process.env.GITHUB_WEBHOOK_SECRET! },
});

const SUPPORTED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java'];

async function generateDoc(fileContent: string, filePath: string): Promise<string> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: `Generate concise technical documentation for this file. Include: purpose, exports/functions, usage examples where relevant.\n\nFile: ${filePath}\n\n\`\`\`\n${fileContent}\n\`\`\``,
    }],
  });
  const block = message.content[0];
  return block.type === 'text' ? block.text : '';
}

export const docSyncWorker = new Worker<DocSyncJob>('doc-sync', async (job) => {
  const { repoId, commitSha, changedFiles, installationId, owner, name } = job.data;

  await db.update(syncEvents).set({ status: 'processing', startedAt: new Date() })
    .where(eq(syncEvents.id, job.id!));

  const octokit = await githubApp.getInstallationOctokit(installationId);

  const relevantFiles = changedFiles.filter((f) =>
    SUPPORTED_EXTENSIONS.some((ext) => f.endsWith(ext))
  );

  // If manual sync with no files specified, get all files from default branch
  const filesToProcess = relevantFiles.length > 0 ? relevantFiles : await (async () => {
    const { data: tree } = await octokit.rest.git.getTree({
      owner, repo: name, tree_sha: 'HEAD', recursive: '1',
    });
    return (tree.tree ?? [])
      .filter((f) => f.type === 'blob' && SUPPORTED_EXTENSIONS.some((ext) => f.path?.endsWith(ext)))
      .map((f) => f.path!);
  })();

  const updatedDocPaths: string[] = [];

  for (const filePath of filesToProcess.slice(0, 20)) { // cap at 20 files per job
    try {
      const { data: fileData } = await octokit.rest.repos.getContent({
        owner, repo: name, path: filePath, ref: commitSha === 'HEAD' ? undefined : commitSha,
      });

      if (!('content' in fileData)) continue;
      const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
      const docContent = await generateDoc(content, filePath);
      const docPath = `docs/${filePath}.md`;

      await db.insert(docs).values({
        repoId, filePath, docPath, content: docContent, commitSha,
      }).onConflictDoUpdate({
        target: [docs.repoId, docs.filePath],
        set: { content: docContent, commitSha, updatedAt: new Date() },
      } as Parameters<typeof db.insert>[0]['onConflictDoUpdate']);

      updatedDocPaths.push(docPath);
    } catch (err) {
      console.error(`Failed to process ${filePath}:`, err);
    }
  }

  await db.update(syncEvents).set({
    status: 'done',
    docsUpdated: updatedDocPaths,
    completedAt: new Date(),
  }).where(eq(syncEvents.id, job.id!));

}, { connection });

docSyncWorker.on('failed', async (job, err) => {
  if (job) {
    await db.update(syncEvents).set({
      status: 'failed', errorMessage: err.message, completedAt: new Date(),
    }).where(eq(syncEvents.id, job.id!));
  }
});
