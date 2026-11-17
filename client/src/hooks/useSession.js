import { useCallback, useEffect, useState } from 'react';
import { api, getStoredSessionId, setStoredSessionId } from '../api/client.js';

const PAGE_SIZE = 100;

export function useSession() {
  const [sessionId, setSessionId] = useState(getStoredSessionId());
  const [fileName, setFileName] = useState(null);
  const [sheets, setSheets] = useState([]);
  const [activeSheetId, setActiveSheetId] = useState(null);
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState(null);
  const [warning, setWarning] = useState(null);

  const applyMeta = useCallback((data) => {
    setSessionId(data.sessionId);
    setStoredSessionId(data.sessionId);
    setFileName(data.fileName ?? null);
    setSheets(data.sheets || []);
    setActiveSheetId(data.activeSheetId);
    const active = (data.sheets || []).find((s) => s.id === data.activeSheetId);
    setWarning(active?.truncateReason || null);
  }, []);

  const loadRows = useCallback(async (sheetId, nextOffset = 0, q = '') => {
    if (!sheetId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getRows(sheetId, {
        offset: nextOffset,
        limit: PAGE_SIZE,
        q,
      });
      setColumns(data.columns || []);
      setRows(data.rows || []);
      setTotal(data.total ?? 0);
      setOffset(data.offset ?? nextOffset);
    } catch (err) {
      setError(err.message);
      if (err.code === 'SESSION_NOT_FOUND') {
        setStoredSessionId(null);
        setSessionId(null);
        setSheets([]);
        setActiveSheetId(null);
        setRows([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!getStoredSessionId()) {
        setBooting(false);
        return;
      }
      try {
        const data = await api.getSession();
        if (cancelled) return;
        applyMeta(data);
        await loadRows(data.activeSheetId, 0, '');
      } catch {
        if (!cancelled) {
          setStoredSessionId(null);
          setSessionId(null);
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyMeta, loadRows]);

  const upload = useCallback(
    async (file) => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.upload(file);
        applyMeta(data);
        setQuery('');
        await loadRows(data.activeSheetId, 0, '');
        return data;
      } catch (err) {
        setError(err.message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [applyMeta, loadRows],
  );

  const selectSheet = useCallback(
    async (sheetId) => {
      if (!sheetId || sheetId === activeSheetId) return;
      setLoading(true);
      setError(null);
      try {
        await api.setActiveSheet(sheetId);
        setActiveSheetId(sheetId);
        const meta = sheets.find((s) => s.id === sheetId);
        setWarning(meta?.truncateReason || null);
        setQuery('');
        await loadRows(sheetId, 0, '');
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [activeSheetId, loadRows, sheets],
  );

  const search = useCallback(
    async (q) => {
      setQuery(q);
      await loadRows(activeSheetId, 0, q);
    },
    [activeSheetId, loadRows],
  );

  const page = useCallback(
    async (nextOffset, sheetIdOverride) => {
      await loadRows(sheetIdOverride || activeSheetId, nextOffset, query);
    },
    [activeSheetId, loadRows, query],
  );

  const clear = useCallback(async () => {
    try {
      await api.deleteSession();
    } catch {
      /* ignore */
    }
    setStoredSessionId(null);
    setSessionId(null);
    setFileName(null);
    setSheets([]);
    setActiveSheetId(null);
    setColumns([]);
    setRows([]);
    setTotal(0);
    setOffset(0);
    setQuery('');
    setWarning(null);
    setError(null);
  }, []);

  return {
    sessionId,
    fileName,
    sheets,
    activeSheetId,
    columns,
    rows,
    total,
    offset,
    pageSize: PAGE_SIZE,
    query,
    loading,
    booting,
    error,
    warning,
    upload,
    selectSheet,
    search,
    page,
    clear,
    setError,
  };
}
