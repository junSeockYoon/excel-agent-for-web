import { env } from '../config/env.js';
import { httpError } from '../middleware/errorHandler.js';

const DEFAULT_TIMEOUT_MS = 60_000;

export function isDeepseekConfigured() {
  return Boolean(env.deepseekConfigured);
}

/**
 * OpenAI-compatible Chat Completions against DeepSeek.
 */
export async function chatCompletion({
  messages,
  temperature = 0.2,
  maxTokens = 2048,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  if (!isDeepseekConfigured()) {
    throw httpError(
      503,
      'DEEPSEEK_NOT_CONFIGURED',
      'DEEPSEEK_API_KEY가 설정되지 않았습니다. .env에 키를 넣은 뒤 서버를 다시 시작하세요.',
    );
  }

  const base = env.deepseekBaseUrl.replace(/\/$/, '');
  const url = `${base}/v1/chat/completions`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.deepseekApiKey}`,
      },
      body: JSON.stringify({
        model: env.deepseekModel,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: false,
      }),
      signal: controller.signal,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const apiMsg =
        data?.error?.message ||
        data?.message ||
        `DeepSeek API 오류 (${res.status})`;
      const status = res.status === 401 || res.status === 403 ? 502 : res.status >= 500 ? 502 : 400;
      throw httpError(
        status,
        'DEEPSEEK_API_ERROR',
        apiMsg,
        { status: res.status },
      );
    }

    const answer = data?.choices?.[0]?.message?.content;
    if (!answer) {
      throw httpError(502, 'DEEPSEEK_EMPTY', 'DeepSeek 응답이 비어 있습니다.');
    }

    return {
      answer,
      usage: data.usage || null,
      model: data.model || env.deepseekModel,
    };
  } catch (err) {
    if (err.code && err.status) throw err;
    if (err.name === 'AbortError') {
      throw httpError(504, 'DEEPSEEK_TIMEOUT', 'DeepSeek 응답 시간이 초과되었습니다.');
    }
    throw httpError(
      502,
      'DEEPSEEK_NETWORK',
      err.message || 'DeepSeek 네트워크 오류가 발생했습니다.',
    );
  } finally {
    clearTimeout(timer);
  }
}
