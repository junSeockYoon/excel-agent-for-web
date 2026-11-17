/**
 * Resolve which sheet(s) a chat question targets.
 * Default: active sheet. Named sheet / 「모든 시트」 supported.
 */

export function listWorkbookSheets(session) {
  return (session.sheetOrder || []).map((id) => {
    const s = session.sheets[id];
    return {
      id: s.id,
      name: s.name,
      rowCount: s.rowCount,
      columnCount: s.columnCount,
      columns: (s.columns || []).map((c) => c.header),
    };
  });
}

export function resolveSheetTarget(message, session, fallbackSheetId) {
  const q = String(message || '').trim();
  const sheets = listWorkbookSheets(session);
  const multi = sheets.length > 1;

  if (/모든\s*시트|전체\s*시트|모든\s*시트에|워크북\s*전체|all\s*sheets?/i.test(q)) {
    return {
      mode: 'all',
      sheetIds: sheets.map((s) => s.id),
      sheets,
      label: '모든 시트',
      multi,
    };
  }

  // 「다른 시트도 요약」 style → all except maybe still all summary
  if (/다른\s*시트|나머지\s*시트|각\s*시트/.test(q)) {
    return {
      mode: 'all',
      sheetIds: sheets.map((s) => s.id),
      sheets,
      label: '모든 시트',
      multi,
    };
  }

  // Named sheet: longest name match first
  const named = [...sheets]
    .sort((a, b) => b.name.length - a.name.length)
    .find((s) => s.name && q.includes(s.name));

  if (named) {
    return {
      mode: 'single',
      sheetIds: [named.id],
      sheets: [named],
      primary: named,
      label: named.name,
      multi,
    };
  }

  const active = session.sheets[fallbackSheetId] || session.sheets[session.activeSheetId];
  return {
    mode: 'single',
    sheetIds: [active.id],
    sheets: sheets.filter((s) => s.id === active.id),
    primary: {
      id: active.id,
      name: active.name,
      rowCount: active.rowCount,
      columnCount: active.columnCount,
    },
    label: active.name,
    multi,
    defaultedToActive: true,
  };
}

export function workbookSchemaSummary(session) {
  return listWorkbookSheets(session).map((s) => ({
    id: s.id,
    name: s.name,
    rows: s.rowCount,
    cols: s.columnCount,
    columns: s.columns.slice(0, 12),
  }));
}
