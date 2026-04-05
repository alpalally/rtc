import { db } from '../db';
import { analyticsEvents } from '../db/schema';

type EventType = 'app_installed' | 'push_received' | 'doc_generated' | 'doc_viewed';

export async function trackEvent(
  eventType: EventType,
  opts: { repoId?: string; docId?: string; userId?: string } = {},
): Promise<void> {
  await db.insert(analyticsEvents).values({
    eventType,
    repoId: opts.repoId ?? null,
    docId: opts.docId ?? null,
    userId: opts.userId ?? null,
  });
}
