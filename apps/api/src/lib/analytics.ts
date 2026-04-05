import { db } from '../db';
import { analyticsEvents } from '../db/schema';

export type EventType = 'app_installed' | 'push_received' | 'doc_generated' | 'doc_viewed' | 'feedback_clicked';

export async function trackEvent(
  eventType: EventType,
  opts: {
    repoId?: string;
    docId?: string;
    userId?: string;
    metadata?: Record<string, unknown>;
  } = {},
): Promise<void> {
  await db.insert(analyticsEvents).values({
    eventType,
    repoId: opts.repoId ?? null,
    docId: opts.docId ?? null,
    userId: opts.userId ?? null,
    metadata: opts.metadata ?? null,
  });
}
