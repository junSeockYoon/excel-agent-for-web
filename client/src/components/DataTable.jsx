import { useEffect, useRef, useState } from 'react';

export default function DataTable({
  columns,
  rows,
  total,
  offset,
  pageSize,
  query,
  loading,
  onSearch,
  onPage,
  highlight,
}) {
  const [draft, setDraft] = useState(query || '');
  const wrapRef = useRef(null);
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + pageSize, total);
  const canPrev = offset > 0;
  const canNext = offset + pageSize < total;

  useEffect(() => {
    if (!highlight || highlight.rowIndex == null) return;
    if (highlight.rowIndex < offset || highlight.rowIndex >= offset + pageSize) return;
    const el = wrapRef.current?.querySelector(
      `tr[data-row-index="${highlight.rowIndex}"]`,
    );
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlight, offset, pageSize, rows]);

  return (
    <>
      <div className="table-toolbar">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSearch(draft.trim());
          }}
        >
          <input
            type="search"
            placeholder="행 검색…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="행 검색"
          />
        </form>
        <div className="pager">
          <span>
            {loading ? (
              <span className="loading-dot">불러오는 중</span>
            ) : (
              `${from}–${to} / ${total}`
            )}
          </span>
          <button
            type="button"
            disabled={!canPrev || loading}
            onClick={() => onPage(Math.max(0, offset - pageSize))}
          >
            이전
          </button>
          <button
            type="button"
            disabled={!canNext || loading}
            onClick={() => onPage(offset + pageSize)}
          >
            다음
          </button>
        </div>
      </div>
      <div
        className="table-wrap"
        ref={wrapRef}
        key={`${offset}-${query}-${columns.map((c) => c.key).join(',')}`}
      >
        <table className="data-table">
          <thead>
            <tr>
              <th className="row-num-col">#</th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  title={col.inferredType}
                  className={
                    highlight?.columnKey === col.key ? 'col-highlight-head' : undefined
                  }
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={Math.max(columns.length, 1) + 1} className="empty-cell">
                  {loading
                    ? '불러오는 중…'
                    : '이 시트에 표시할 행이 없습니다. 다른 시트를 선택하거나 파일을 다시 올려 보세요.'}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => {
                const rowIndex = offset + i;
                const isHi = highlight?.rowIndex === rowIndex;
                return (
                  <tr
                    key={rowIndex}
                    data-row-index={rowIndex}
                    className={isHi ? 'row-highlight' : undefined}
                  >
                    <td className="row-num-col">{rowIndex + 1}</td>
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        title={row[col.key] == null ? '' : String(row[col.key])}
                        className={
                          isHi && highlight?.columnKey === col.key
                            ? 'cell-highlight'
                            : undefined
                        }
                      >
                        {row[col.key] == null ? '' : String(row[col.key])}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
