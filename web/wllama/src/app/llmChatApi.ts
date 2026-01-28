import type { GenerationParams } from './state';

export type LlmChatMessage = { role: 'user' | 'assistant' | 'system'; content: string };

export type LlmChatApiDeps = {
  isModelLoaded: () => boolean;
  waitUntilIdle: () => Promise<void>;
  readParams: () => GenerationParams;
  chat: (messages: LlmChatMessage[], params: GenerationParams, abortSignal: AbortSignal, onText: (text: string) => void) => Promise<void>;
};

export function createLlmChatApi(deps: LlmChatApiDeps): (messages: unknown) => Promise<string> {
  let queue: Promise<void> = Promise.resolve();

  const enqueue = async <T,>(task: () => Promise<T>): Promise<T> => {
    const next = queue.then(task);
    queue = next.then(
      () => undefined,
      () => undefined,
    );
    return await next;
  };

  return async (messages: unknown): Promise<string> => {
    return await enqueue(async () => {
      if (!deps.isModelLoaded()) throw new Error('模型未加载');
      await deps.waitUntilIdle();
      if (!deps.isModelLoaded()) throw new Error('模型未加载');

      const safeMessages = normalizeExternalMessages(messages);
      const genParams = deps.readParams();
      const params = { ...genParams, stream: false };
      const abort = new AbortController();
      let out = '';
      await deps.chat(safeMessages, params, abort.signal, (text) => {
        out = text;
      });
      return out;
    });
  };
}

export function normalizeExternalMessages(input: unknown): LlmChatMessage[] {
  if (!Array.isArray(input)) {
    throw new Error('messages 必须是数组');
  }
  const out: LlmChatMessage[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') {
      throw new Error('messages 每项必须是对象');
    }
    const role = (item as any).role;
    const content = (item as any).content;
    if (role !== 'user' && role !== 'assistant' && role !== 'system') {
      throw new Error('messages.role 必须是 user/assistant/system');
    }
    if (typeof content !== 'string') {
      throw new Error('messages.content 必须是字符串');
    }
    out.push({ role, content });
  }
  return out;
}

