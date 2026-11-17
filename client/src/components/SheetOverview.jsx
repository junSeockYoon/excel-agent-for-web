/**
 * Cross-sheet overview strip — click a sheet to switch (charts/table follow).
 */
export default function SheetOverview({ sheets, activeSheetId, onSelect }) {
  if (!sheets?.length || sheets.length < 2) return null;

  return (
    <section className="sheet-overview" aria-label="워크북 시트 개요">
      <div className="sheet-overview-head">
        <p className="analysis-kicker">Workbook</p>
        <h2>시트 한눈에 보기</h2>
        <span className="sheet-overview-hint">클릭하면 해당 시트로 전환됩니다</span>
      </div>
      <div className="sheet-overview-grid">
        {sheets.map((sheet) => {
          const active = sheet.id === activeSheetId;
          return (
            <button
              key={sheet.id}
              type="button"
              className={`sheet-overview-item${active ? ' is-active' : ''}`}
              onClick={() => onSelect(sheet.id)}
            >
              <span className="sheet-overview-name">{sheet.name}</span>
              <span className="sheet-overview-stats">
                <strong>{sheet.rowCount}</strong> 행
                <span aria-hidden="true"> · </span>
                <strong>{sheet.columnCount}</strong> 열
              </span>
              {active ? <span className="sheet-overview-badge">보는 중</span> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
