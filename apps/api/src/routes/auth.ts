import { Router } from 'express';

export const authRouter = Router();

// Auth routes are handled by NextAuth on the web app.
// This stub exists for future server-side session validation middleware.
authRouter.get('/health', (_req, res) => res.json({ ok: true }));
