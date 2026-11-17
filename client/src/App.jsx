import { useCallback, useEffect, useState } from 'react';
import UploadDropzone from './components/UploadDropzone.jsx';
import SheetTabs from './components/SheetTabs.jsx';
import SheetOverview from './components/SheetOverview.jsx';
import AnalysisCharts from './components/AnalysisCharts.jsx';
import DataTable from './components/DataTable.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import { useSession } from './hooks/useSession.js';

const VIEW_KEY = 'excel_agent_main_view';

function readSavedView() {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    if (v === 'analysis' || v === 'table') return v;
  } catch {
    /* ignore */
  }
  return 'table';
}

export default function App() {
  const session = useSession();
  const hasSession = Boolean(session.sessionId && session.sheets.length);
  const [highlight, setHighlight] = useState(null);
  const [mainView, setMainView] = useState(readSavedView);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, mainView);
    } catch {
      /* ignore */
    }
  }, [mainView]);

  // After a fresh upload/session, prefer 표 so data is immediately visible
  useEffect(() => {
    if (hasSession) setMainView((prev) => prev || 'table');
  }, [hasSession, session.sessionId]);

  const selectSheet = useCallback(
    (id) => {
      setHighlight(null);
      session.selectSheet(id);
    },
    [session],
  );

  const onEvidenceClick = useCallback(
    async ({ rowIndex, columnKey, sheetId }) => {
      if (rowIndex == null || Number.isNaN(rowIndex)) return;
      setMainView('table');
      const targetSheet = sheetId || session.activeSheetId;
      if (sheetId && sheetId !== session.activeSheetId) {
        await session.selectSheet(sheetId);
      }
      const pageSize = session.pageSize || 100;
      const targetOffset = Math.floor(rowIndex / pageSize) * pageSize;
      await session.page(targetOffset, targetSheet);
      setHighlight({ rowIndex, columnKey: columnKey || null, at: Date.now() });
    },
    [session],
  );

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true" />
          <div>
            <div className="brand-name">excel_agent</div>
            <div className="brand-tag">시트는 테이블로, 질문은 근거와 함께</div>
          </div>
        </div>
        <div className="top-meta">
          {session.fileName ? <span className="file-pill">{session.fileName}</span> : null}
          {hasSession ? (
            <button
              type="button"
              className="ghost-btn"
              onClick={() => {
                setHighlight(null);
                session.clear();
              }}
            >
              세션 지우기
            </button>
          ) : null}
        </div>
      </header>

      <main className="main">
        {session.error ? <div className="error-banner">{session.error}</div> : null}
        {session.warning ? <div className="warn-banner">{session.warning}</div> : null}

        {session.booting ? (
          <div className="landing">
            <div className="landing-inner">
              <p className="lead loading-dot">세션 확인 중</p>
            </div>
          </div>
        ) : !hasSession ? (
          <div className="landing">
            <div className="landing-inner">
              <p className="landing-kicker">Workbook → answers</p>
              <h1>excel_agent</h1>
              <p className="lead">
                올리는 순간 시트가 펼쳐지고, 오른쪽 챗이 행·시트 근거로 답합니다. 여러 시트도
                한 번에 요약할 수 있어요.
              </p>
              <UploadDropzone onUpload={session.upload} disabled={session.loading} />
              <p className="landing-footnote">.xlsx · .xls · .csv · 로컬에서만 처리</p>
            </div>
          </div>
        ) : (
          <>
            <SheetTabs
              sheets={session.sheets}
              activeSheetId={session.activeSheetId}
              onSelect={selectSheet}
            />
            <div className="upload-inline">
              <UploadDropzone onUpload={session.upload} disabled={session.loading} />
            </div>

            <div className="main-view-tabs" role="tablist" aria-label="보기 전환">
              <button
                type="button"
                role="tab"
                aria-selected={mainView === 'table'}
                className={`main-view-tab${mainView === 'table' ? ' is-active' : ''}`}
                onClick={() => setMainView('table')}
              >
                표
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mainView === 'analysis'}
                className={`main-view-tab${mainView === 'analysis' ? ' is-active' : ''}`}
                onClick={() => setMainView('analysis')}
              >
                분석
              </button>
            </div>

            <div className="main-view-pane">
              {mainView === 'analysis' ? (
                <div className="analysis-pane">
                  <SheetOverview
                    sheets={session.sheets}
                    activeSheetId={session.activeSheetId}
                    onSelect={selectSheet}
                  />
                  <AnalysisCharts
                    sheetId={session.activeSheetId}
                    sessionId={session.sessionId}
                  />
                  {!session.sheets?.length ? (
                    <p className="pane-empty">분석할 시트가 없습니다.</p>
                  ) : null}
                </div>
              ) : (
                <div className="table-pane">
                  <DataTable
                    columns={session.columns}
                    rows={session.rows}
                    total={session.total}
                    offset={session.offset}
                    pageSize={session.pageSize}
                    query={session.query}
                    loading={session.loading}
                    onSearch={session.search}
                    onPage={session.page}
                    highlight={highlight}
                  />
                </div>
              )}
            </div>
          </>
        )}
      </main>

      <div className="rail">
        <ChatPanel
          hasSession={hasSession}
          sessionId={session.sessionId}
          activeSheetId={session.activeSheetId}
          onEvidenceClick={onEvidenceClick}
        />
      </div>
    </div>
  );
}
