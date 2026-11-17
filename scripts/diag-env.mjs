import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env');

console.log('CWD', process.cwd());
console.log('ROOT', root);
console.log('ENV_PATH', envPath);
console.log('ENV_EXISTS', fs.existsSync(envPath));

if (fs.existsSync(envPath)) {
  const buf = fs.readFileSync(envPath);
  console.log('ENV_BYTES', buf.length);
  console.log('HAS_BOM_UTF8', buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf);
  console.log('LOOKS_UTF16LE', buf[0] === 0xff && buf[1] === 0xfe);
  console.log('LOOKS_UTF16BE', buf[0] === 0xfe && buf[1] === 0xff);

  const raw = buf.toString('utf8').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/);
  let found = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*#/.test(line) || !line.includes('DEEPSEEK_API_KEY')) continue;
    const m = line.match(/^\s*DEEPSEEK_API_KEY\s*=(.*)$/);
    if (!m) {
      console.log('KEY_LINE_MALFORMED_AT', i + 1);
      continue;
    }
    found = true;
    const v = m[1];
    const trimmed = v.trim();
    let unquoted = trimmed;
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      unquoted = trimmed.slice(1, -1);
    }
    console.log('KEY_LINE_FOUND', true);
    console.log('LINE_NO', i + 1);
    console.log('RAW_LEN', v.length);
    console.log('TRIM_LEN', trimmed.length);
    console.log('UNQUOTED_LEN', unquoted.length);
    console.log('IS_EMPTY', unquoted.length === 0);
    console.log('WHITESPACE_ONLY', trimmed.length > 0 && unquoted.trim().length === 0);
    console.log('HAS_OUTER_QUOTES', unquoted !== trimmed);
    console.log('HAS_LEADING_TRAILING_SPACE_IN_VALUE', v.length > 0 && v !== trimmed);
    console.log(
      'LOOKS_LIKE_PLACEHOLDER',
      /sk-\.\.\.|your.?key|여기에|example|changeme/i.test(unquoted),
    );
    console.log('STARTS_WITH_SK', unquoted.startsWith('sk-'));
  }
  if (!found) console.log('KEY_LINE_FOUND', false);

  // Compare cwd load vs root load (never print values)
  const cwdResult = dotenv.config();
  const cwdKey = process.env.DEEPSEEK_API_KEY;
  console.log('DOTENV_CWD_ERROR', cwdResult.error ? String(cwdResult.error.message) : null);
  console.log('AFTER_CWD_LOAD_LEN', cwdKey ? String(cwdKey).trim().length : 0);

  delete process.env.DEEPSEEK_API_KEY;
  const rootResult = dotenv.config({ path: envPath, override: true });
  const rootKey = process.env.DEEPSEEK_API_KEY;
  console.log('DOTENV_ROOT_ERROR', rootResult.error ? String(rootResult.error.message) : null);
  console.log('AFTER_ROOT_LOAD_LEN', rootKey ? String(rootKey).trim().length : 0);
}
