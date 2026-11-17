export default function SheetTabs({ sheets, activeSheetId, onSelect }) {
  if (!sheets?.length) return null;
  return (
    <div className="sheet-switcher">
      <div className="sheet-switcher-label">시트</div>
      <div className="sheet-tabs" role="tablist" aria-label="시트 전환">
        {sheets.map((sheet) => {
          const active = sheet.id === activeSheetId;
          return (
            <button
              key={sheet.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`sheet-tab${active ? ' is-active' : ''}`}
              onClick={() => onSelect(sheet.id)}
              title={`${sheet.name} · ${sheet.rowCount}행 × ${sheet.columnCount}열`}
            >
              <span className="sheet-tab-name">{sheet.name}</span>
              <span className="sheet-tab-meta">
                {sheet.rowCount}행 · {sheet.columnCount}열
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
