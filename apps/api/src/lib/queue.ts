import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export interface DocSyncJob {
  repoId: string;
  commitSha: string;
  changedFiles: string[];
  installationId: number;
  owner: string;
  name: string;
}

export const docSyncQueue = new Queue<DocSyncJob>('doc-sync', { connection });
