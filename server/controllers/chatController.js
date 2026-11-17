import { env } from '../config/env.js';
import { httpError } from '../middleware/errorHandler.js';
import {
  mergeEvidence,
  structuredClarify,
  structuredFromTool,
  structuredUngrounded,
  structuredWorkbookSummary,
} from '../services/answerFormat.js';
import { buildContextPack, SYSTEM_PROMPT } from '../services/contextPacker.js';
import { chatCompletion, isDeepseekConfigured } from '../services/deepseekClient.js';
import {
  annotateEvidence,
  buildEvidence,
} from '../services/evidence.js';
import { classifyIntent, resolveFollowUpMessage } from '../services/intentClassifier.js';
import { sessionStore } from '../services/sessionStore.js';
import {
  computeAggregate,
  filterRows,
  summarizeSheet,
} from '../services/sheetAggregates.js';
import {
  resolveSheetTarget,
  workbookSchemaSummary,
} from '../services/sheetTarget.js';
import { buildSuggestions } from '../services/suggestPrompts.js';

function runTools(intent, sheet) {
  if (!intent) return null;
  if (intent.intent === 'summary') return summarizeSheet(sheet);

  if (intent.intent === 'aggregate' && intent.column) {
    return computeAggregate(sheet, {
      metric: intent.metric || 'sum',
      columnKey: intent.column.key,
    });
  }

  if (intent.intent === 'ranking' && intent.column) {
    return computeAggregate(sheet, {
      metric: intent.metric === 'bottomn' ? 'bottomn' : 'topn',
      columnKey: intent.column.key,
      topN: intent.topN || 5,
    });
  }

  if (intent.intent === 'outlier' && intent.column) {
    return computeAggregate(sheet, {
      metric: 'outlier',
      columnKey: intent.column.key,
    });
  }

  if (intent.intent === 'filter' && intent.column && intent.filterEquals) {
    return filterRows(sheet, {
      columnKey: intent.column.key,
      equals: intent.filterEquals,
    });
  }

  if (
    intent.intent === 'filter' &&
    intent.column &&
    /건수|개수|분포/.test(intent.rawQuestion || '')
  ) {
    const counts = new Map();
    for (const row of sheet.rows || []) {
      const v = row[intent.column.key];
      if (v == null || v === '') continue;
      const s = String(v);
      counts.set(s, (counts.get(s) || 0) + 1);
    }
    const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
    return {
      ok: true,
      kind: 'filter',
      column: intent.column,
      matchCount: (sheet.rows || []).length,
      evidence: [],
      table: {
        columns: [intent.column.header, '건수'],
        rows: entries.map(([k, v]) => [k, v]),
      },
    };
  }

  return null;
}

function tagToolEvidence(toolResult, sheet) {
  if (!toolResult?.evidence) return toolResult;
  return {
    ...toolResult,
    evidence: toolResult.evidence.map((e) => ({
      ...e,
      sheetId: sheet.id,
      sheetName: sheet.name,
    })),
  };
}

function buildChatContext(intent, message, sheetTarget) {
  return {
    lastQuestion: message,
    lastIntent: intent.intent,
    lastColumnKey: intent.column?.key || null,
    lastColumnHeader: intent.column?.header || null,
    lastMetric: intent.metric || null,
    lastTopN: intent.topN || null,
    lastFilterEquals: intent.filterEquals || null,
    lastSheetId: sheetTarget?.sheetIds?.[0] || null,
    lastSheetMode: sheetTarget?.mode || 'single',
  };
}

function workbookToolSummary(session, sheetIds) {
  const perSheet = [];
  for (const id of sheetIds) {
    const sheet = session.sheets[id];
    if (!sheet) continue;
    const sum = summarizeSheet(sheet);
    const numericPreview = (sum.numeric || [])
      .filter((n) => n.stats)
      .slice(0, 2)
      .map((n) => `${n.header} 합계 ${n.stats.sum}`)
      .join(', ');
    perSheet.push({
      id: sheet.id,
      name: sheet.name,
      rowCount: sheet.rowCount,
      columnCount: sheet.columnCount,
      numericPreview: numericPreview || null,
      summary: sum,
    });
  }
  return {
    ok: true,
    kind: 'workbook_summary',
    sheets: perSheet,
    evidence: [],
    structured: structuredWorkbookSummary(perSheet),
  };
}

export async function postChat(req, res, next) {
  let lockHeld = false;
  try {
    if (!isDeepseekConfigured()) {
      throw httpError(
        503,
        'DEEPSEEK_NOT_CONFIGURED',
        'DEEPSEEK_API_KEY가 설정되지 않았습니다. 프로젝트 루트 .env에 키를 추가한 뒤 서버를 재시작하세요.',
      );
    }

    const message = String(req.body?.message || '').trim();
    if (!message) {
      throw httpError(400, 'EMPTY_MESSAGE', '질문을 입력하세요.');
    }
    if (message.length > 4000) {
      throw httpError(400, 'MESSAGE_TOO_LONG', '질문이 너무 깁니다. (최대 4000자)');
    }

    const session = req.session;
    const requestedSheetId = req.body?.sheetId || session.activeSheetId;
    if (!session.sheets[requestedSheetId] && !session.sheets[session.activeSheetId]) {
      throw httpError(404, 'SHEET_NOT_FOUND', '시트를 찾을 수 없습니다.');
    }

    if (!sessionStore.tryLockChat(session.id)) {
      throw httpError(
        429,
        'CHAT_IN_FLIGHT',
        '이전 질문에 답하는 중입니다. 잠시 후 다시 시도하세요.',
      );
    }
    lockHeld = true;

    const followUp = resolveFollowUpMessage(message, session.chatContext);
    const effectiveQuestion = followUp.message;
    const sheetTarget = resolveSheetTarget(
      effectiveQuestion,
      session,
      requestedSheetId,
    );
    const includeSheetLabel = (session.sheetOrder || []).length > 1;
    const workbookSummary = workbookSchemaSummary(session);

    const primaryId = sheetTarget.sheetIds[0];
    const sheet = session.sheets[primaryId];
    const suggestions = buildSuggestions(sheet, session.sheetOrder?.length > 1);

    // All-sheets summary path — deterministic tool, then LLM explain
    let toolResult = null;
    let intent = classifyIntent({
      message: effectiveQuestion,
      sheet,
      chatContext: session.chatContext,
    });

    if (sheetTarget.mode === 'all') {
      intent = { ...intent, intent: intent.intent === 'clarify' ? 'summary' : intent.intent || 'summary' };
      if (intent.intent === 'summary' || /요약|한눈에|overview|다른\s*시트|모든\s*시트/.test(effectiveQuestion)) {
        toolResult = workbookToolSummary(session, sheetTarget.sheetIds);
        intent = { ...intent, intent: 'summary' };
      }
    }

    if (intent.intent === 'ungrounded') {
      const answer = intent.missingColumn
        ? `「${intent.missingColumn}」 컬럼은 시트에 없습니다. 데이터에 없습니다.`
        : '요청하신 내용을 시트에서 찾을 수 없습니다. 데이터에 없습니다.';
      const structured = structuredUngrounded(answer);
      sessionStore.appendChat(session.id, [
        { role: 'user', content: message },
        { role: 'assistant', content: answer },
      ]);
      return res.json({
        answer,
        structured,
        evidence: [],
        intent,
        followUp,
        sheetTarget,
        suggestions,
        grounding: { sheetId: sheet.id, note: answer, ungrounded: true },
        sheetId: sheet.id,
        model: null,
        usage: null,
      });
    }

    if (intent.intent === 'clarify' && sheetTarget.mode !== 'all') {
      const answer = intent.clarifyQuestion;
      const structured = structuredClarify(intent);
      sessionStore.appendChat(session.id, [
        { role: 'user', content: message },
        { role: 'assistant', content: answer },
      ]);
      sessionStore.setChatContext(
        session.id,
        buildChatContext(intent, effectiveQuestion, sheetTarget),
      );
      return res.json({
        answer,
        structured,
        evidence: [],
        intent,
        followUp,
        sheetTarget,
        suggestions,
        grounding: {
          sheetId: sheet.id,
          sheetName: sheet.name,
          note: '질문이 모호해 확인이 필요합니다.',
          clarified: true,
        },
        sheetId: sheet.id,
        model: null,
        usage: null,
      });
    }

    if (!toolResult) {
      toolResult = runTools(intent, sheet);
      if (toolResult) toolResult = tagToolEvidence(toolResult, sheet);
    }

    if (
      sheetTarget.mode === 'single' &&
      (intent.intent === 'aggregate' || intent.intent === 'ranking' || intent.intent === 'outlier') &&
      !intent.column
    ) {
      const answer = '요청하신 숫자 열을 시트에서 찾지 못했습니다. 데이터에 없습니다.';
      const structured = structuredUngrounded(answer);
      sessionStore.appendChat(session.id, [
        { role: 'user', content: message },
        { role: 'assistant', content: answer },
      ]);
      return res.json({
        answer,
        structured,
        evidence: [],
        intent,
        followUp,
        sheetTarget,
        suggestions,
        grounding: { sheetId: sheet.id, note: answer, ungrounded: true },
        sheetId: sheet.id,
        model: null,
        usage: null,
      });
    }

    if (toolResult && toolResult.ok === false) {
      const answer =
        toolResult.reason === 'COLUMN_NOT_FOUND'
          ? '해당 컬럼이 시트에 없습니다. 데이터에 없습니다.'
          : toolResult.reason === 'NO_NUMERIC_VALUES'
            ? '해당 열에 숫자 값이 없습니다.'
            : '계산할 수 있는 데이터가 없습니다.';
      const structured = structuredUngrounded(answer);
      sessionStore.appendChat(session.id, [
        { role: 'user', content: message },
        { role: 'assistant', content: answer },
      ]);
      return res.json({
        answer,
        structured,
        evidence: [],
        intent,
        followUp,
        sheetTarget,
        suggestions,
        grounding: { sheetId: sheet.id, note: answer, ungrounded: true },
        sheetId: sheet.id,
        model: null,
        usage: null,
      });
    }

    const { userContent, groundingMeta, allowedRowIndexes } = buildContextPack({
      sheet,
      question: effectiveQuestion,
      history: session.chat || [],
      intent,
      toolResult,
      followUp,
      workbookSummary,
      sheetTarget,
    });

    const result = await chatCompletion({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      temperature: 0.15,
      maxTokens: 2048,
    });

    const allowedMap = new Map();
    allowedMap.set(sheet.id, new Set(allowedRowIndexes));
    // For workbook mode, allow first N rows of each sheet for evidence
    if (sheetTarget.mode === 'all') {
      for (const id of sheetTarget.sheetIds) {
        const s = session.sheets[id];
        if (!s) continue;
        const set = new Set();
        const n = Math.min(30, s.rows?.length || 0);
        for (let i = 0; i < n; i += 1) set.add(i);
        allowedMap.set(id, set);
      }
    }

    const parsed = buildEvidence({
      answer: result.answer,
      sheet,
      sheetsById: session.sheets,
      allowedRowIndexes: allowedMap,
      includeSheetLabel,
    });

    const serverEv = annotateEvidence(
      toolResult?.evidence || [],
      sheet,
      includeSheetLabel,
    );
    const evidence = mergeEvidence(serverEv, parsed.evidence).map((e) => ({
      ...e,
      showSheet: includeSheetLabel,
    }));

    let structured =
      toolResult?.structured ||
      structuredFromTool(toolResult, intent);
    if (!structured) {
      structured = {
        kind: intent.intent || 'explain',
      };
    }

    groundingMeta.knownColumns = (sheet.columns || []).map((c) => c.header);
    groundingMeta.workbookSheets = workbookSummary;

    sessionStore.appendChat(session.id, [
      { role: 'user', content: message },
      { role: 'assistant', content: parsed.answer },
    ]);
    sessionStore.setChatContext(
      session.id,
      buildChatContext(intent, effectiveQuestion, sheetTarget),
    );

    res.json({
      answer: parsed.answer,
      structured,
      evidence,
      intent,
      followUp,
      sheetTarget,
      suggestions,
      tool: toolResult
        ? { kind: toolResult.kind, metric: toolResult.metric, ok: toolResult.ok }
        : null,
      grounding: groundingMeta,
      usage: result.usage,
      model: result.model,
      sheetId: sheet.id,
    });
  } catch (err) {
    next(err);
  } finally {
    if (lockHeld && req.session?.id) {
      sessionStore.unlockChat(req.session.id);
    }
  }
}

export function chatStatus(_req, res) {
  res.json({
    configured: isDeepseekConfigured(),
    model: env.deepseekModel,
    sampleRows: env.chatSampleRows,
    features: {
      aggregates: true,
      intent: true,
      followUp: true,
      suggestions: true,
      structured: true,
      multiSheet: true,
      streaming: false,
    },
  });
}

export function chatSuggestions(req, res, next) {
  try {
    const session = req.session;
    if (!session) {
      throw httpError(404, 'SESSION_NOT_FOUND', '세션이 없거나 만료되었습니다.');
    }
    const sheetId = req.query.sheetId || session.activeSheetId;
    const sheet = session.sheets[sheetId];
    if (!sheet) throw httpError(404, 'SHEET_NOT_FOUND', '시트를 찾을 수 없습니다.');
    res.json({
      sheetId,
      suggestions: buildSuggestions(sheet, (session.sheetOrder || []).length > 1),
    });
  } catch (err) {
    next(err);
  }
}
