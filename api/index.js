import fs from 'fs';
import { createApp } from '../server/app.js';
import { env } from '../server/config/env.js';

// Serverless entry for Vercel. Long-lived `app.listen` is not used here.
try {
  fs.mkdirSync(env.uploadDir, { recursive: true });
} catch {
  /* ignore — /tmp should exist on Vercel */
}

const app = createApp();

export default app;
