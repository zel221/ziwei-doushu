/**
 * 浏览器侧 SSE 组行。InsightPanel / ChatPanel 按块读 body，
 * 一块里可能切断 `data:` 行；先拼回完整行再交给 JSON.parse。
 */
export interface SsePull {
  pending: string;
  events: string[];
  done: boolean;
}

export function pushSseChunk(pending: string, chunk: string): SsePull {
  const lines = (pending + chunk).split('\n');
  const nextPending = lines.pop() ?? '';
  const events: string[] = [];
  for (const raw of lines) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (!line.startsWith('data: ')) continue;
    const data = line.slice(6).trim();
    if (data === '[DONE]') return { pending: '', events, done: true };
    events.push(data);
  }
  return { pending: nextPending, events, done: false };
}

/** 流结束时把最后一行（没有换行符）也交出去。 */
export function flushSsePending(pending: string): SsePull {
  if (!pending) return { pending: '', events: [], done: false };
  const pulled = pushSseChunk('', pending.endsWith('\n') ? pending : `${pending}\n`);
  return { pending: '', events: pulled.events, done: pulled.done };
}
