import path from 'path';

export function sanitizeFilename(name) {
  const base = path.basename(String(name || 'file'));
  return base.replace(/[^\w.\uac00-\ud7a3\-()+ ]+/g, '_').slice(0, 180) || 'file';
}

const ISO_DT =
  /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Format Date for table/API display: local YYYY-MM-DD or YYYY-MM-DD HH:mm[:ss].
 * Time-only Excel serials (epoch ~1899/1900) → HH:mm.
 */
export function formatDateCell(value) {
  let d = null;
  if (value instanceof Date) {
    d = value;
  } else if (typeof value === 'string') {
    const s = value.trim();
    const m = ISO_DT.exec(s);
    if (m) {
      d = new Date(s);
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      return s;
    }
  }
  if (!d || Number.isNaN(d.getTime())) return null;

  const y = d.getFullYear();
  const mo = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  const hh = d.getHours();
  const mm = d.getMinutes();
  const ss = d.getSeconds();
  const hasTime = hh !== 0 || mm !== 0 || ss !== 0;

  // Excel time-only values often land near the 1899-12-30 epoch
  if (y <= 1900 && hasTime) {
    return ss
      ? `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`
      : `${pad2(hh)}:${pad2(mm)}`;
  }

  if (!hasTime) return `${y}-${mo}-${day}`;
  if (!ss) return `${y}-${mo}-${day} ${pad2(hh)}:${pad2(mm)}`;
  return `${y}-${mo}-${day} ${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
}

export function sanitizeCell(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : String(value);
  }
  if (typeof value === 'boolean') return value;

  const asDate = formatDateCell(value);
  if (asDate !== null) return asDate;

  const s = String(value);
  return s.length > 2000 ? `${s.slice(0, 2000)}…` : s;
}

export function extOf(filename) {
  const i = String(filename || '').lastIndexOf('.');
  return i >= 0 ? String(filename).slice(i).toLowerCase() : '';
}
