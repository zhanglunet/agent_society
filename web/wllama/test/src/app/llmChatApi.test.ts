import { describe, expect, test } from 'bun:test';
import { createLlmChatApi } from '../../../src/app/llmChatApi';

describe('llmChatApi', () => {
  test('returns full text once and forces non-stream', async () => {
    const calls: any[] = [];
    const llmChat = createLlmChatApi({
      isModelLoaded: () => true,
      waitUntilIdle: async () => {},
      readParams: () => ({ nPredict: 10, temp: 0.7, topK: 40, topP: 0.9, stream: true }),
      chat: async (messages, params, _abort, onText) => {
        calls.push({ messages, params });
        onText('OK');
      },
    });

    const input = [
      { role: 'system', content: 'S' },
      { role: 'user', content: 'hi' },
    ];
    const out = await llmChat(input);
    expect(out).toBe('OK');
    expect(calls.length).toBe(1);
    expect(calls[0].messages).toEqual(input);
    expect(calls[0].params.stream).toBe(false);
  });

  test('serializes calls and waits until idle', async () => {
    let idleResolve: (() => void) | null = null;
    let waitCalls = 0;
    const waitUntilIdle = async () => {
      waitCalls += 1;
      await new Promise<void>((resolve) => {
        idleResolve = resolve;
      });
    };

    const order: string[] = [];
    let resolveFirst: (() => void) | null = null;
    const llmChat = createLlmChatApi({
      isModelLoaded: () => true,
      waitUntilIdle,
      readParams: () => ({ nPredict: 10, temp: 0.7, topK: 40, topP: 0.9, stream: false }),
      chat: async (_messages, _params, _abort, onText) => {
        order.push('chat:start');
        onText('A');
        await new Promise<void>((resolve) => {
          resolveFirst = resolve;
        });
        order.push('chat:end');
      },
    });

    const p1 = llmChat([{ role: 'user', content: '1' }]);
    const p2 = llmChat([{ role: 'user', content: '2' }]);

    await new Promise((r) => setTimeout(r, 0));
    expect(waitCalls).toBe(1);
    expect(order).toEqual([]);

    idleResolve?.();
    await new Promise((r) => setTimeout(r, 0));
    expect(order).toEqual(['chat:start']);

    resolveFirst?.();
    await expect(p1).resolves.toBe('A');

    await new Promise((r) => setTimeout(r, 0));
    expect(waitCalls).toBe(2);
    idleResolve?.();
    await new Promise((r) => setTimeout(r, 0));
    resolveFirst?.();
    await expect(p2).resolves.toBe('A');
  });

  test('rejects when model is not loaded', async () => {
    const llmChat = createLlmChatApi({
      isModelLoaded: () => false,
      waitUntilIdle: async () => {},
      readParams: () => ({ nPredict: 10, temp: 0.7, topK: 40, topP: 0.9, stream: false }),
      chat: async () => {},
    });

    await expect(llmChat([{ role: 'user', content: 'hi' }])).rejects.toThrow('模型未加载');
  });
});
