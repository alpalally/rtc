import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  GITHUB_APP_ID: z.string(),
  GITHUB_APP_PRIVATE_KEY: z.string(),
  GITHUB_WEBHOOK_SECRET: z.string(),
  ANTHROPIC_API_KEY: z.string(),
  API_PORT: z.coerce.number().default(3001),
});

export const config = envSchema.parse(process.env);
