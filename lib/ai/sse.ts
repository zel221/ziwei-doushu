import { isRecord } from './util';

export const SSE_HEADERS: Record<string, string> = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
};

const EMPTY_REPLY = '模型没有返回可读正文，请换一个模型或稍后重试。';
const UPSTREAM_ERROR = '模型返回错误，请检查 API Key、模型名或稍后重试。';
const INTERRUPTED = '（解读中断，请稍后重试。）';

export function clientDelta(text: string): string {
  return `data: ${JSON.stringify({ delta: { text } })}\n\n`;
}

export function clientDone(): string {
  return 'data: [DONE]\n\n';
}

/** 只取可见正文。Grok 的 reasoning_content 是推理摘要，不转给命盘面板。 */
export function extractContent(payload: unknown): string[] {
  const record = isRecord(payload) ? payload : undefined;
  const choices = record && Array.isArray(record.choices) ? record.choices : [];
  const choice = isRecord(choices[0]) ? choices[0] : undefined;
  const delta = choice ? (isRecord(choice.delta) ? choice.delta : undefined) : undefined;
  if (!delta) return [];
  const content = delta.content;
  if (typeof content === 'string') return content ? [content] : [];
  if (!Array.isArray(content)) return [];
  const texts: string[] = [];
  for (const part of content) {
    if (typeof part === 'string') {
      if (part) texts.push(part);
      continue;
    }
    if (isRecord(part) && typeof part.text === 'string' && part.text) texts.push(part.text);
  }
  return texts;
}

function consumeUpstreamLine(raw: string, emitText: (text: string) => void): boolean {
  const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
  if (!line.startsWith('data:')) return false;
  const payload = line.slice(5).trim();
  if (!payload) return false;
  if (payload === '[DONE]') return true;
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return false;
  }
  const record = isRecord(parsed) ? parsed : undefined;
  if (record?.error && !Array.isArray(record.choices)) {
    emitText(UPSTREAM_ERROR);
    return true;
  }
  for (const text of extractContent(parsed)) emitText(text);
  return false;
}

/**
 * 把 OpenAI 兼容的 chat.completions 流改写成前端约定的
 * `data: {"delta":{"text":…}}`，并以 `data: [DONE]` 结束。
 */
export function transformOpenAiSse(
  upstream: ReadableStream<Uint8Array>,
  onDone?: () => void,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return new ReadableStream({
    async start(controller) {
      const reader = upstream.getReader();
      let pending = '';
      let emitted = false;
      let closed = false;

      const emitText = (text: string) => {
        if (!text || closed) return;
        controller.enqueue(encoder.encode(clientDelta(text)));
        emitted = true;
      };

      const finish = () => {
        if (closed) return;
        closed = true;
        try {
          if (!emitted) controller.enqueue(encoder.encode(clientDelta(EMPTY_REPLY)));
          controller.enqueue(encoder.encode(clientDone()));
          controller.close();
        } catch {
          /* 客户端已断开 */
        } finally {
          onDone?.();
        }
      };

      try {
        while (!closed) {
          const { done, value } = await reader.read();
          if (done) {
            pending += decoder.decode();
            if (pending && consumeUpstreamLine(pending, emitText)) {
              finish();
              return;
            }
            break;
          }
          pending += decoder.decode(value, { stream: true });
          const lines = pending.split('\n');
          pending = lines.pop() ?? '';
          for (const line of lines) {
            if (consumeUpstreamLine(line, emitText)) {
              finish();
              await reader.cancel().catch(() => {});
              return;
            }
          }
        }
        finish();
      } catch {
        if (!closed) {
          try {
            emitText(emitted ? `\n\n${INTERRUPTED}` : INTERRUPTED);
          } catch {
            /* 客户端已断开 */
          }
          finish();
        } else {
          onDone?.();
        }
      }
    },
    cancel() {
      onDone?.();
    },
  });
}
