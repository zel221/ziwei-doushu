import { streamChatCompletion, jsonError } from './chat';
import { buildHemingMessages, buildInterpretMessages } from './prompts';
import { resolveAiProvider, type Env } from './provider';
import { isRecord } from './util';

export interface HandlerDeps {
  env?: Env;
  fetch?: typeof fetch;
}

async function readJsonObject(req: Request): Promise<
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; status: number; error: string }
> {
  let text: string;
  try {
    text = await req.text();
  } catch {
    return { ok: false, status: 400, error: '无法读取请求体。' };
  }
  if (text.length > 1_000_000) return { ok: false, status: 413, error: '请求体过大。' };
  try {
    const value: unknown = JSON.parse(text);
    if (!isRecord(value)) return { ok: false, status: 400, error: '请求体必须是 JSON 对象。' };
    return { ok: true, value };
  } catch {
    return { ok: false, status: 400, error: '请求体不是合法 JSON。' };
  }
}

async function handle(
  req: Request,
  build: (body: Record<string, unknown>) => ReturnType<typeof buildInterpretMessages>,
  deps: HandlerDeps,
): Promise<Response> {
  const body = await readJsonObject(req);
  if (!body.ok) return jsonError(body.status, body.error);
  const messages = build(body.value);
  if (!messages.ok) return jsonError(messages.status, messages.error);
  const provider = resolveAiProvider(deps.env ?? process.env);
  if (!provider.ok) return jsonError(provider.status, provider.error);
  return streamChatCompletion({
    provider: provider.provider,
    messages: messages.messages,
    fetchImpl: deps.fetch,
    signal: req.signal,
  });
}

export async function handleInterpret(req: Request, deps: HandlerDeps = {}): Promise<Response> {
  try {
    return await handle(req, buildInterpretMessages, deps);
  } catch (err) {
    console.error('[ai] interpret failed', err instanceof Error ? err.name : 'error');
    return jsonError(500, '解读服务内部错误，请稍后重试。');
  }
}

export async function handleHeming(req: Request, deps: HandlerDeps = {}): Promise<Response> {
  try {
    return await handle(req, buildHemingMessages, deps);
  } catch (err) {
    console.error('[ai] heming failed', err instanceof Error ? err.name : 'error');
    return jsonError(500, '合盘服务内部错误，请稍后重试。');
  }
}
