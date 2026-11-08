import { providerKeyHint, type AiProvider } from './provider';
import { SSE_HEADERS, transformOpenAiSse } from './sse';
import type { ChatMessage } from './prompts';

const UPSTREAM_TIMEOUT_MS = 180_000;

export function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function armTimeout(ms: number, onTimeout: () => void): () => void {
  const timer = setTimeout(onTimeout, ms);
  (timer as { unref?: () => void }).unref?.();
  return () => clearTimeout(timer);
}

function anySignal(signals: Array<AbortSignal | undefined>): AbortSignal {
  const controller = new AbortController();
  const abort = () => {
    if (!controller.signal.aborted) controller.abort();
  };
  for (const signal of signals) {
    if (!signal) continue;
    if (signal.aborted) {
      abort();
      break;
    }
    signal.addEventListener('abort', abort, { once: true });
  }
  return controller.signal;
}

export async function streamChatCompletion(options: {
  provider: AiProvider;
  messages: ChatMessage[];
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeout = new AbortController();
  const clearTimer = armTimeout(UPSTREAM_TIMEOUT_MS, () => {
    if (!timeout.signal.aborted) timeout.abort();
  });
  const finishTimer = () => clearTimer();

  let upstream: Response;
  try {
    upstream = await fetchImpl(`${options.provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.provider.apiKey}`,
      },
      body: JSON.stringify({
        model: options.provider.model,
        stream: true,
        messages: options.messages,
      }),
      cache: 'no-store',
      signal: anySignal([timeout.signal, options.signal]),
    });
  } catch (err) {
    finishTimer();
    if (options.signal?.aborted) return new Response(null, { status: 499 });
    const timedOut = timeout.signal.aborted || (err instanceof Error && err.name === 'TimeoutError');
    console.error('[ai] upstream fetch failed', options.provider.kind, err instanceof Error ? err.name : 'error');
    return jsonError(502, timedOut ? '模型响应超时，请稍后重试。' : '无法连接模型服务，请检查网络与 BASE_URL。');
  }

  if (!upstream.ok || !upstream.body) {
    finishTimer();
    await upstream.body?.cancel().catch(() => {});
    console.error('[ai] upstream', options.provider.kind, 'HTTP', upstream.status);
    if (upstream.status === 401 || upstream.status === 403) {
      return jsonError(503, `模型服务拒绝了 API Key，请检查 ${providerKeyHint(options.provider.kind)} 是否正确。`);
    }
    return jsonError(502, `模型服务返回错误（HTTP ${upstream.status}），请检查模型名与 BASE_URL。`);
  }

  return new Response(transformOpenAiSse(upstream.body, finishTimer), {
    status: 200,
    headers: SSE_HEADERS,
  });
}
