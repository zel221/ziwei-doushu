export const DEFAULT_XAI_BASE_URL = 'https://api.x.ai/v1';
/** xAI Chat Completions 文档当前示例用的对话模型。不可用时用 XAI_MODEL 覆盖。 */
export const DEFAULT_XAI_MODEL = 'grok-4.7';
export const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';
export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat';

export type Env = Record<string, string | undefined>;

export type ProviderKind = 'grok' | 'deepseek' | 'mimo';

export interface AiProvider {
  kind: ProviderKind;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export type ProviderResult =
  | { ok: true; provider: AiProvider }
  | { ok: false; status: number; error: string };

const KEY_ENV: Record<ProviderKind, string> = {
  grok: 'XAI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  mimo: 'MIMO_API_KEY',
};

const PLACEHOLDER_KEY = /^your[-_].*key$/i;

function read(env: Env, name: string): string {
  return env[name]?.trim() ?? '';
}

function normalizeKind(raw: string): ProviderKind | undefined {
  const name = raw.trim().toLowerCase();
  if (name === 'grok' || name === 'xai') return 'grok';
  if (name === 'deepseek') return 'deepseek';
  if (name === 'mimo') return 'mimo';
  return undefined;
}

function inferKind(env: Env): ProviderKind | undefined {
  if (read(env, 'XAI_API_KEY')) return 'grok';
  if (read(env, 'DEEPSEEK_API_KEY')) return 'deepseek';
  if (read(env, 'MIMO_API_KEY')) return 'mimo';
  return undefined;
}

function normalizeBaseUrl(raw: string): string | undefined {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return undefined;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
  if (url.username || url.password) return undefined;
  return trimmed;
}

function invalidKey(key: string): boolean {
  return !key || PLACEHOLDER_KEY.test(key) || /[\r\n]/.test(key);
}

export function resolveAiProvider(env: Env = process.env): ProviderResult {
  const requested = read(env, 'AI_PROVIDER');
  let kind: ProviderKind | undefined;
  if (requested) {
    kind = normalizeKind(requested);
    if (!kind) {
      return {
        ok: false,
        status: 400,
        error: `不认识的 AI_PROVIDER=${requested}。可用 grok、xai、deepseek、mimo。`,
      };
    }
  } else {
    kind = inferKind(env);
  }

  if (!kind) {
    return {
      ok: false,
      status: 503,
      error: '未配置模型 API Key。请在 .env.local 设置 AI_PROVIDER=grok 与 XAI_API_KEY 后重启开发服务器。',
    };
  }

  const keyName = KEY_ENV[kind];
  const apiKey = read(env, keyName);
  if (invalidKey(apiKey)) {
    return {
      ok: false,
      status: 503,
      error: `未配置 ${keyName}。请写入 .env.local 后重启开发服务器。`,
    };
  }

  const baseRaw = kind === 'grok'
    ? read(env, 'XAI_BASE_URL')
    : kind === 'deepseek'
      ? read(env, 'DEEPSEEK_BASE_URL')
      : read(env, 'MIMO_BASE_URL');
  const baseDefault = kind === 'grok'
    ? DEFAULT_XAI_BASE_URL
    : kind === 'deepseek'
      ? DEFAULT_DEEPSEEK_BASE_URL
      : '';
  const baseUrl = normalizeBaseUrl(baseRaw || baseDefault);
  if (!baseUrl) {
    const hint = kind === 'mimo' ? 'MIMO_BASE_URL' : kind === 'grok' ? 'XAI_BASE_URL' : 'DEEPSEEK_BASE_URL';
    return { ok: false, status: 503, error: `${hint} 不是合法的 http(s) 地址。` };
  }

  const modelRaw = kind === 'grok'
    ? read(env, 'XAI_MODEL')
    : kind === 'deepseek'
      ? read(env, 'DEEPSEEK_MODEL')
      : read(env, 'MIMO_MODEL');
  const modelDefault = kind === 'grok'
    ? DEFAULT_XAI_MODEL
    : kind === 'deepseek'
      ? DEFAULT_DEEPSEEK_MODEL
      : '';
  const model = (modelRaw || modelDefault).slice(0, 128);
  if (!model || /[\r\n]/.test(model)) {
    return { ok: false, status: 503, error: '未配置模型名。Grok 用 XAI_MODEL，DeepSeek 用 DEEPSEEK_MODEL，其他兼容服务用 MIMO_MODEL。' };
  }

  return { ok: true, provider: { kind, apiKey, baseUrl, model } };
}

export function providerKeyHint(kind: ProviderKind): string {
  return KEY_ENV[kind];
}
