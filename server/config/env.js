import dotenv from 'dotenv';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../..');
const envPath = path.join(rootDir, '.env');
const onVercel = Boolean(process.env.VERCEL);

// Always load from package root — do not depend on process.cwd()
const dotenvResult = dotenv.config({ path: envPath });
if (dotenvResult.error && process.env.NODE_ENV !== 'test') {
  console.warn(`[env] could not load ${envPath}: ${dotenvResult.error.message}`);
}

function intEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

const allowed = (process.env.ALLOWED_EXTENSIONS || '.xlsx,.xls,.csv')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const deepseekApiKey = String(process.env.DEEPSEEK_API_KEY || '').trim();

export const env = {
  port: intEnv('PORT', 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: (process.env.NODE_ENV || 'development') === 'production',

  deepseekApiKey,
  deepseekConfigured: deepseekApiKey.length > 0,
  deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  deepseekModel: process.env.DEEPSEEK_MODEL || 'deepseek-chat',

  uploadMaxBytes: intEnv('UPLOAD_MAX_BYTES', 10 * 1024 * 1024),
  // Vercel only allows writable /tmp; local/prod Node keeps ./uploads
  uploadDir: onVercel
    ? path.join(os.tmpdir(), 'excel-helper-uploads')
    : path.resolve(rootDir, process.env.UPLOAD_DIR || './uploads'),
  sessionTtlMs: intEnv('SESSION_TTL_MS', 2 * 60 * 60 * 1000),
  allowedExtensions: allowed,

  chatSampleRows: intEnv('CHAT_SAMPLE_ROWS', 30),
  chatMaxContextChars: intEnv('CHAT_MAX_CONTEXT_CHARS', 48000),
  chatHistoryTurns: intEnv('CHAT_HISTORY_TURNS', 10),

  maxRowsPerSheet: 5000,
  maxCellsPerSheet: 50000,
  defaultPageLimit: 100,
  maxPageLimit: 200,

  rootDir,
  envPath,
  onVercel,
  clientDist: path.resolve(rootDir, 'dist'),
};
