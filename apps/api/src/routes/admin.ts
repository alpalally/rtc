import { Router } from 'express';
import { db } from '../db';
import { analyticsEvents } from '../db/schema';
import { eq, sql } from 'drizzle-orm';

export const adminRouter = Router();

adminRouter.get('/metrics', async (_req, res) => {
  const rows = await db
    .select({ eventType: analyticsEvents.eventType, count: sql<number>`count(*)::int` })
    .from(analyticsEvents)
    .groupBy(analyticsEvents.eventType);

  const counts: Record<string, number> = {
    app_installed: 0,
    push_received: 0,
    doc_generated: 0,
    doc_viewed: 0,
  };

  for (const row of rows) {
    counts[row.eventType] = row.count;
  }

  const pushToViewRate = counts.push_received > 0
    ? (counts.doc_viewed / counts.push_received * 100).toFixed(1)
    : null;

  res.json({
    app_installed: counts.app_installed,
    push_received: counts.push_received,
    doc_generated: counts.doc_generated,
    doc_viewed: counts.doc_viewed,
    push_to_view_rate_pct: pushToViewRate ? Number(pushToViewRate) : null,
  });
});
