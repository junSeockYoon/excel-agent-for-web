import { useEffect, useRef } from 'react';
import { useChat } from '../hooks/useChat.js';
import MarkdownMessage from './MarkdownMessage.jsx';
import MiniStructuredChart from './MiniStructuredChart.jsx';

function EvidenceChips({ evidence, onEvidenceClick }) {
  if (!evidence?.length) return null;
  return (
    <div className="evidence-row" aria-label="답변 근거">
      <span className="evidence-label">근거</span>
      {evidence.map((ev) => {
        const colPart = ev.columns?.length
          ? ` · ${ev.columns.map((c) => c.header).join(', ')}`
          : '';
        const sheetPart =
          ev.showSheet && ev.sheetName ? `${ev.sheetName} · ` : '';
        return (
          <button
            key={`ev-${ev.sheetId || 's'}-${ev.rowIndex}-${ev.columns?.map((c) => c.key).join('-') || 'row'}`}
            type="button"
            className="evidence-chip"
            onClick={() =>
              onEvidenceClick?.({
                rowIndex: ev.rowIndex,
                columnKey: ev.columns?.[0]?.key || null,
                sheetId: ev.sheetId || null,
              })
            }
            title="테이블에서 이 행으로 이동"
          >
            {sheetPart}행 {ev.rowLabel}
            {colPart}
          </button>
        );
      })}
    </div>
  );
}

function StructuredBlock({ structured }) {
  if (!structured) return null;
  return (
    <div className={`structured-block kind-${structured.kind || 'explain'}`}>
      {structured.title ? <div className="structured-title">{structured.title}</div> : null}
      {structured.metrics?.length ? (
        <div className="structured-metrics">
          {structured.metrics.map((m) => (
            <div key={m.label} className="metric-chip">
              <span>{m.label}</span>
              <strong>{m.value}</strong>
            </div>
          ))}
        </div>
      ) : null}
      {structured.bullets?.length ? (
        <ul className="structured-bullets">
          {structured.bullets.map((b, i) => (
            <li key={`${i}-${String(b).slice(0, 12)}`}>{b}</li>
          ))}
        </ul>
      ) : null}
      {structured.kind === 'ranking' ||
      structured.kind === 'filter' ||
      structured.kind === 'aggregate' ||
      structured.kind === 'outlier' ? (
        <MiniStructuredChart structured={structured} />
      ) : null}
      {structured.table?.rows?.length ? (
        <div className="structured-table-wrap">
          <table className="structured-table">
            <thead>
              <tr>
                {(structured.table.columns || []).map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {structured.table.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>{cell == null ? '' : String(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export default function ChatPanel({
  hasSession,
  sessionId,
  activeSheetId,
  onEvidenceClick,
}) {
  const chat = useChat({
    sessionId,
    activeSheetId,
    enabled: hasSession,
  });
  const threadRef = useRef(null);
  const endRef = useRef(null);

  const canSend =
    hasSession && !chat.loading && chat.draft.trim().length > 0 && chat.configured !== false;

  useEffect(() => {
    const el = endRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chat.messages, chat.loading]);

  return (
    <aside className="chat-panel" aria-label="시트 챗봇">
      <div className="chat-panel-header">
        <p className="chat-kicker">Sheet chat</p>
        <h2>시트 챗봇</h2>
        <p className="sub">
          기본은 활성 시트. 「모든 시트」·시트 이름을 말해 범위를 바꿀 수 있어요.
        </p>
        {chat.configured === false ? (
          <div className="error-banner banner-inline">
            DEEPSEEK_API_KEY가 없습니다. 프로젝트 루트 `.env`에 키를 넣고 서버를 재시작하세요.
          </div>
        ) : null}
      </div>

      <div className="chat-thread" ref={threadRef}>
        <div className="chat-thread-inner">
          {!hasSession ? (
            <div className="chat-bubble">
              먼저 Excel/CSV를 업로드하면 챗이 그 시트를 기준으로 답합니다.
            </div>
          ) : chat.messages.length === 0 ? (
            <div className="chat-bubble">
              아래 추천 질문을 누르거나, 「매출 합계는?」「상위 3행」처럼 물어보세요.
            </div>
          ) : (
            chat.messages.map((m, i) => (
              <div
                key={`${m.role}-${i}`}
                className={`chat-bubble${m.role === 'user' ? ' chat-bubble-user' : ''}${
                  m.structured?.kind === 'ungrounded' ? ' chat-bubble-warn' : ''
                }${m.structured?.kind === 'clarify' ? ' chat-bubble-clarify' : ''}`}
              >
                <strong className="chat-role">{m.role === 'user' ? '나' : '조수'}</strong>
                {m.role === 'assistant' ? (
                  <>
                    <div className="chat-content">
                      <MarkdownMessage>{m.content}</MarkdownMessage>
                    </div>
                    <StructuredBlock structured={m.structured} />
                    <EvidenceChips evidence={m.evidence} onEvidenceClick={onEvidenceClick} />
                  </>
                ) : (
                  <div className="chat-content chat-content-plain">{m.content}</div>
                )}
              </div>
            ))
          )}
          {chat.loading ? (
            <div className="chat-bubble">
              <span className="loading-dot">답변 작성 중</span>
            </div>
          ) : null}
          <div ref={endRef} className="chat-thread-end" aria-hidden="true" />
        </div>
      </div>

      <div className="chat-panel-footer">
        {hasSession && chat.suggestions?.length ? (
          <div className="suggest-row" aria-label="추천 질문">
            {chat.suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                className="suggest-chip"
                disabled={chat.loading || chat.configured === false}
                onClick={() => chat.sendText(s.prompt)}
              >
                {s.label}
              </button>
            ))}
          </div>
        ) : null}
        {chat.lastGrounding?.note ? (
          <p className="sub grounding-note">{chat.lastGrounding.note}</p>
        ) : null}
        {chat.error ? <div className="error-banner banner-inline">{chat.error}</div> : null}
        <form
          className="chat-compose"
          onSubmit={(e) => {
            e.preventDefault();
            chat.send();
          }}
        >
          <input
            type="text"
            placeholder={hasSession ? '시트에 대해 질문…' : '업로드 후 질문 가능'}
            value={chat.draft}
            disabled={!hasSession || chat.loading || chat.configured === false}
            onChange={(e) => chat.setDraft(e.target.value)}
            aria-label="챗 질문"
          />
          <button type="submit" disabled={!canSend}>
            보내기
          </button>
        </form>
      </div>
    </aside>
  );
}
