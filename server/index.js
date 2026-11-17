import fs from 'fs';
import { createApp } from './app.js';
import { env } from './config/env.js';

fs.mkdirSync(env.uploadDir, { recursive: true });

const app = createApp();

app.listen(env.port, () => {
  console.log(`[excel-helper] API listening on http://localhost:${env.port}`);
  console.log(`[excel-helper] uploads → ${env.uploadDir}`);
  console.log(`[excel-helper] env file → ${env.envPath}`);
  console.log(
    `[excel-helper] phase 2 (DeepSeek ${env.deepseekConfigured ? 'configured' : 'NOT configured'})`,
  );
});
