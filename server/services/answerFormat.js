/**
 * Build UI structured blocks from tool results / clarify / ungrounded answers.
 */

export function structuredFromTool(toolResult, intent) {
  if (!toolResult?.ok) return null;

  if (toolResult.kind === 'aggregate') {
    const m = toolResult.metric;
    const label =
      m === 'sum'
        ? '합계'
        : m === 'avg'
          ? '평균'
          : m === 'min'
            ? '최소'
            : m === 'max'
              ? '최대'
              : m === 'count'
                ? '개수'
                : m;
    return {
      kind: 'aggregate',
      title: `${toolResult.column.header} ${label}`,
      metrics: [
        { label, value: toolResult.result.value },
        { label: '개수', value: toolResult.result.count },
        { label: '평균', value: toolResult.result.avg },
        { label: '최소', value: toolResult.result.min },
        { label: '최대', value: toolResult.result.max },
      ],
      table: toolResult.table,
      bullets: [
        `${toolResult.column.header} ${label}: ${toolResult.result.value}`,
        `유효 숫자 ${toolResult.result.count}개 (평균 ${toolResult.result.avg})`,
      ],
    };
  }

  if (toolResult.kind === 'ranking') {
    return {
      kind: 'ranking',
      title: `${toolResult.column.header} ${toolResult.direction === 'asc' ? '하위' : '상위'} ${toolResult.topN}`,
      table: toolResult.table,
      bullets: (toolResult.result || []).map(
        (r) => `${r.rank}위 · 행 ${r.rowLabel} · ${r.value}`,
      ),
    };
  }

  if (toolResult.kind === 'outlier') {
    const n = toolResult.result?.outliers?.length || 0;
    return {
      kind: 'outlier',
      title: `${toolResult.column.header} 이상치`,
      bullets:
        n === 0
          ? ['IQR 기준 이상치가 없습니다.']
          : toolResult.result.outliers
              .slice(0, 8)
              .map((o) => `행 ${o.rowLabel}: ${o.value}`),
      table: toolResult.table,
      metrics: [
        { label: 'Q1', value: toolResult.result.q1 },
        { label: 'Q3', value: toolResult.result.q3 },
        { label: '이상치 수', value: n },
      ],
    };
  }

  if (toolResult.kind === 'filter') {
    return {
      kind: 'filter',
      title: `${toolResult.column.header} 필터 결과`,
      bullets: [`일치 ${toolResult.matchCount}행`],
      table: toolResult.table,
    };
  }

  if (toolResult.kind === 'summary') {
    return {
      kind: 'summary',
      title: '시트 요약',
      bullets: [
        `행 ${toolResult.rowCount} · 열 ${toolResult.columnCount}`,
        ...toolResult.numeric
          .filter((n) => n.stats)
          .slice(0, 4)
          .map((n) => `${n.header}: 합계 ${n.stats.sum}, 평균 ${n.stats.avg}`),
      ],
    };
  }

  return { kind: intent?.intent || 'explain', table: toolResult.table || null };
}

export function structuredClarify(intent) {
  return {
    kind: 'clarify',
    title: '확인이 필요해요',
    bullets: [
      intent.clarifyQuestion,
      ...(intent.candidates || []).map((c) => `후보: ${c.header}`),
    ],
  };
}

export function structuredUngrounded(reason) {
  return {
    kind: 'ungrounded',
    title: '데이터에 없음',
    bullets: [reason || '요청하신 컬럼/값이 시트에 없습니다.'],
  };
}

export function mergeEvidence(serverEvidence = [], modelEvidence = []) {
  const map = new Map();
  for (const ev of [...serverEvidence, ...modelEvidence]) {
    if (ev == null || typeof ev.rowIndex !== 'number') continue;
    const sheetId = ev.sheetId || '_';
    const key = `${sheetId}:${ev.rowIndex}`;
    const prev = map.get(key) || {
      rowIndex: ev.rowIndex,
      rowLabel: ev.rowLabel ?? ev.rowIndex + 1,
      columns: [],
      sheetId: ev.sheetId,
      sheetName: ev.sheetName,
      showSheet: ev.showSheet,
    };
    for (const c of ev.columns || []) {
      if (!prev.columns.some((x) => x.key === c.key)) prev.columns.push(c);
    }
    if (ev.sheetId) prev.sheetId = ev.sheetId;
    if (ev.sheetName) prev.sheetName = ev.sheetName;
    if (ev.showSheet) prev.showSheet = true;
    map.set(key, prev);
  }
  return [...map.values()].slice(0, 12);
}

export function structuredWorkbookSummary(perSheet) {
  return {
    kind: 'summary',
    title: '워크북 시트 요약',
    bullets: perSheet.map(
      (s) =>
        `**${s.name}**: 행 ${s.rowCount} · 열 ${s.columnCount}` +
        (s.numericPreview ? ` · ${s.numericPreview}` : ''),
    ),
    table: {
      columns: ['시트', '행', '열', '숫자열 요약'],
      rows: perSheet.map((s) => [
        s.name,
        s.rowCount,
        s.columnCount,
        s.numericPreview || '—',
      ]),
    },
  };
}
