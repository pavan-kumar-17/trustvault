import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  PUBLIC_APP_ORIGIN: z.string().default('http://localhost:3000'),
  SUPABASE_URL: z.string().default('https://mock.supabase.co'),
  SUPABASE_PUBLISHABLE_KEY: z.string().default('mock-publishable-key'),
  SUPABASE_SECRET_KEY: z.string().default('mock-secret-key'),
  MAX_UPLOAD_BYTES: z.coerce.number().default(10485760), // 10 MB limit
  JWT_SECRET: z.string().min(16).default('super-secret-trustvault-key-min-32-chars-long'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
