import { Router } from 'express';
import { db } from '../db';
import { syncEvents } from '../db/schema';
import { eq } from 'drizzle-orm';

export const eventsRouter = Router();

eventsRouter.get('/:eventId', async (req, res) => {
  const [event] = await db.select().from(syncEvents).where(eq(syncEvents.id, req.params.eventId));
  if (!event) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(event);
});
