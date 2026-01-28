import { Wllama } from '@wllama/wllama';
import type { WllamaChatMessage } from '@wllama/wllama';
import type { GenerationParams, ModelLoadParams } from '../app/state';

export type WllamaEngine = {
  loadFromUrl: (params: ModelLoadParams, onProgress: (p: number) => void) => Promise<void>;
  unload: () => Promise<void>;
  getRuntimeInfo: () => {
    crossOriginIsolated: boolean;
    hardwareConcurrency: number;
    threads: number;
    batchSize: number;
  };
  chat: (
    messages: WllamaChatMessage[],
    params: GenerationParams,
    abortSignal: AbortSignal,
    onTextDelta: (deltaText: string) => void,
  ) => Promise<void>;
};

export function createWllamaEngine(): WllamaEngine {
  const configPaths = {
    'single-thread/wllama.wasm': new URL('@wllama/wllama/esm/single-thread/wllama.wasm', import.meta.url).toString(),
    'multi-thread/wllama.wasm': new URL('@wllama/wllama/esm/multi-thread/wllama.wasm', import.meta.url).toString(),
  } as const;

  let wllama: Wllama | null = null;
  let loaded = false;
  let lastThreads = 1;
  let lastBatchSize = 128;

  const getOrCreate = (): Wllama => {
    if (!wllama) {
      wllama = new Wllama(configPaths, { parallelDownloads: 3 });
    }
    return wllama;
  };

  const getRuntimeInfo: WllamaEngine['getRuntimeInfo'] = () => {
    const isIsolated = globalThis.crossOriginIsolated === true;
    const hcRaw = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 1;
    const hc = Number.isFinite(hcRaw) && hcRaw > 0 ? hcRaw : 1;
    const suggested = Math.max(1, Math.floor(hc / 2));
    const threads = isIsolated ? Math.max(2, Math.min(8, suggested)) : 1;
    const batchSize = threads > 1 ? 512 : 256;
    return { crossOriginIsolated: isIsolated, hardwareConcurrency: hc, threads, batchSize };
  };

  const loadFromUrl: WllamaEngine['loadFromUrl'] = async (params, onProgress) => {
    const inst = getOrCreate();
    const runtime = getRuntimeInfo();
    lastThreads = runtime.threads;
    lastBatchSize = runtime.batchSize;
    const locHref = globalThis.location?.href ?? 'http://localhost/';
    const baseDir = new URL('./', locHref);
    const absoluteModelUrl = new URL(params.modelUrl, baseDir).toString();
    await verifyGgufUrl(absoluteModelUrl);
    await inst.loadModelFromUrl(absoluteModelUrl, {
      n_ctx: params.nCtx,
      n_threads: runtime.threads,
      n_batch: runtime.batchSize,
      progressCallback: ({ loaded: l, total }) => {
        if (!total || total <= 0) {
          onProgress(0);
          return;
        }
        onProgress(l / total);
      },
    });
    loaded = true;
  };

  const unload: WllamaEngine['unload'] = async () => {
    if (!wllama) return;
    await wllama.exit();
    loaded = false;
  };

  const chat: WllamaEngine['chat'] = async (messages, params, abortSignal, onTextDelta) => {
    if (!loaded) {
      throw new Error('模型未加载');
    }
    const inst = getOrCreate();
    const decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;
    await inst.createChatCompletion(messages, {
      useCache: true,
      abortSignal,
      nPredict: params.nPredict,
      sampling: {
        temp: params.temp,
        top_k: params.topK,
        top_p: params.topP,
      },
      onNewToken: (_token, piece, currentText) => {
        if (decoder && piece instanceof Uint8Array) {
          const delta = decoder.decode(piece, { stream: true });
          if (delta) onTextDelta(delta);
          return;
        }
        if (typeof currentText === 'string') {
          onTextDelta(currentText);
        }
      },
    });
    if (decoder) {
      const tail = decoder.decode();
      if (tail) onTextDelta(tail);
    }
  };

  return {
    loadFromUrl,
    unload,
    getRuntimeInfo: () => ({ ...getRuntimeInfo(), threads: lastThreads, batchSize: lastBatchSize }),
    chat,
  };
}

async function verifyGgufUrl(absoluteUrl: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(absoluteUrl, { headers: { Range: 'bytes=0-3' } });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(`无法获取模型文件：${message}（URL=${absoluteUrl}）`);
  }

  if (!res.ok) {
    let body = '';
    try {
      body = await res.text();
    } catch {
      body = '';
    }
    const snippet = body ? body.slice(0, 120) : '';
    throw new Error(`模型文件请求失败：HTTP ${res.status}（URL=${absoluteUrl}）${snippet ? `，响应片段：${snippet}` : ''}`);
  }

  const bytes = await readAtMostBytes(res, 4);
  const magic = bytes.length >= 4 ? String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) : '';
  if (magic !== 'GGUF') {
    const ct = res.headers.get('content-type') ?? '';
    throw new Error(`模型文件不是 GGUF（magic=${JSON.stringify(magic)}，content-type=${ct}，URL=${absoluteUrl}）`);
  }
}

async function readAtMostBytes(res: Response, maxBytes: number): Promise<Uint8Array> {
  if (maxBytes <= 0) return new Uint8Array();
  if (!res.body) {
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf.slice(0, maxBytes));
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
    }
  }

  const out = new Uint8Array(Math.min(total, maxBytes));
  let offset = 0;
  for (const c of chunks) {
    if (offset >= out.length) break;
    const len = Math.min(c.byteLength, out.length - offset);
    out.set(c.subarray(0, len), offset);
    offset += len;
  }
  return out;
}
