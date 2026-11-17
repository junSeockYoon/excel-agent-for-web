import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';

export function useChat({ sessionId, activeSheetId, enabled }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [configured, setConfigured] = useState(null);
  const [lastGrounding, setLastGrounding] = useState(null);
  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await api.chatStatus();
        if (!cancelled) setConfigured(Boolean(status.configured));
      } catch {
        if (!cancelled) setConfigured(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setMessages([]);
    setError(null);
    setLastGrounding(null);
    setDraft('');
    setSuggestions([]);
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!enabled || !activeSheetId || !sessionId) {
        setSuggestions([]);
        return;
      }
      try {
        const data = await api.chatSuggestions(activeSheetId);
        if (!cancelled) setSuggestions(data.suggestions || []);
      } catch {
        if (!cancelled) setSuggestions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, activeSheetId, sessionId]);

  const sendText = useCallback(
    async (rawText) => {
      const text = String(rawText || '').trim();
      if (!text || loading || !enabled) return null;
      setLoading(true);
      setError(null);
      setDraft('');
      setMessages((prev) => [...prev, { role: 'user', content: text }]);
      try {
        const data = await api.chat(text, activeSheetId);
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.answer,
            evidence: data.evidence || [],
            structured: data.structured || null,
            grounding: data.grounding || null,
            intent: data.intent || null,
          },
        ]);
        setLastGrounding(data.grounding || null);
        if (data.suggestions?.length) setSuggestions(data.suggestions);
        setConfigured(true);
        return data;
      } catch (err) {
        setError(err.message || '답변을 가져오지 못했습니다.');
        if (err.code === 'DEEPSEEK_NOT_CONFIGURED') {
          setConfigured(false);
        }
        return null;
      } finally {
        setLoading(false);
      }
    },
    [activeSheetId, enabled, loading],
  );

  const send = useCallback(async () => sendText(draft), [draft, sendText]);

  return {
    messages,
    draft,
    setDraft,
    loading,
    error,
    configured,
    lastGrounding,
    suggestions,
    send,
    sendText,
  };
}
