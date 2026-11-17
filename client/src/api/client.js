const SESSION_KEY = 'excel_agent_session_id';

export function getStoredSessionId() {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function setStoredSessionId(id) {
  try {
    if (id) localStorage.setItem(SESSION_KEY, id);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const sessionId = getStoredSessionId();
  if (sessionId) headers.set('X-Session-Id', sessionId);
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(path, {
    ...options,
    headers,
    credentials: 'include',
  });

  const headerSession = res.headers.get('X-Session-Id');
  if (headerSession) setStoredSessionId(headerSession);

  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || `요청 실패 (${res.status})`);
    err.code = data?.error?.code;
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  health: () => request('/api/health'),
  upload: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return request('/api/upload', { method: 'POST', body: fd });
  },
  getSession: () => request('/api/session'),
  deleteSession: () => request('/api/session', { method: 'DELETE' }),
  listSheets: () => request('/api/sheets'),
  getSheet: (sheetId) => request(`/api/sheets/${encodeURIComponent(sheetId)}`),
  getRows: (sheetId, { offset = 0, limit = 100, q = '' } = {}) => {
    const params = new URLSearchParams({
      offset: String(offset),
      limit: String(limit),
    });
    if (q) params.set('q', q);
    return request(`/api/sheets/${encodeURIComponent(sheetId)}/rows?${params}`);
  },
  getDistributions: (sheetId) =>
    request(`/api/sheets/${encodeURIComponent(sheetId)}/distributions`),
  setActiveSheet: (sheetId) =>
    request('/api/session/active-sheet', {
      method: 'PUT',
      body: JSON.stringify({ sheetId }),
    }),
  chatStatus: () => request('/api/chat/status'),
  chatSuggestions: (sheetId) => {
    const q = sheetId ? `?sheetId=${encodeURIComponent(sheetId)}` : '';
    return request(`/api/chat/suggestions${q}`);
  },
  chat: (message, sheetId) =>
    request('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message, sheetId }),
    }),
};
