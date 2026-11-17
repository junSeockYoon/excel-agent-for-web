import path from 'path';

export function sanitizeFilename(name) {
  const base = path.basename(String(name || 'file'));
  return base.replace(/[^\w.\uac00-\ud7a3\-()+ ]+/g, '_').slice(0, 180) || 'file';
}

export function sanitizeCell(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : String(value);
  }
  if (typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  const s = String(value);
  return s.length > 2000 ? `${s.slice(0, 2000)}…` : s;
}

export function extOf(filename) {
  const i = String(filename || '').lastIndexOf('.');
  return i >= 0 ? String(filename).slice(i).toLowerCase() : '';
}
