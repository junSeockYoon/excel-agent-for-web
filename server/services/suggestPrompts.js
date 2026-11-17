import { numericColumns, stringColumns } from './sheetAggregates.js';

/**
 * Korean suggested prompts from sheet schema.
 * @param {object} sheet
 * @param {boolean|number} multiOrLimit - true if multi-sheet workbook, or numeric limit
 */
export function buildSuggestions(sheet, multiOrLimit = 6) {
  const multi = typeof multiOrLimit === 'boolean' ? multiOrLimit : false;
  const limit = typeof multiOrLimit === 'number' ? multiOrLimit : 6;
  const tips = [];
  const nums = numericColumns(sheet);
  const strs = stringColumns(sheet);

  tips.push({
    id: 'summary',
    label: '이 시트 한눈에 요약',
    prompt: '이 시트를 한눈에 요약해줘.',
  });

  if (multi) {
    tips.push({
      id: 'all-sheets',
      label: '모든 시트 요약',
      prompt: '모든 시트를 한눈에 요약해줘.',
    });
  }

  for (const col of nums.slice(0, 2)) {
    tips.push({
      id: `sum-${col.key}`,
      label: `${col.header} 합계는?`,
      prompt: `${col.header} 합계와 평균을 알려줘.`,
    });
    tips.push({
      id: `top-${col.key}`,
      label: `${col.header} 상위 3행`,
      prompt: `${col.header} 기준 상위 3개 행을 알려줘.`,
    });
  }

  if (nums[0]) {
    tips.push({
      id: `out-${nums[0].key}`,
      label: `${nums[0].header} 이상치`,
      prompt: `${nums[0].header}에서 이상치가 있으면 알려줘.`,
    });
  }

  for (const col of strs.slice(0, 1)) {
    tips.push({
      id: `dist-${col.key}`,
      label: `${col.header}별 건수`,
      prompt: `${col.header} 값별 건수를 알려줘.`,
    });
  }

  const seen = new Set();
  const out = [];
  for (const t of tips) {
    if (seen.has(t.prompt)) continue;
    seen.add(t.prompt);
    out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}
