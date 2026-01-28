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
    const threads = isIsolated ? Math.max(2, Math.min(8, hc)) : 1;
    const batchSize = threads > 1 ? 256 : 128;
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
    let lastTextLen = 0;
    await inst.createChatCompletion(messages, {
      useCache: true,
      abortSignal,
      nPredict: params.nPredict,
      sampling: {
        temp: params.temp,
        top_k: params.topK,
        top_p: params.topP,
      },
      onNewToken: (_token, _piece, currentText) => {
        if (typeof currentText !== 'string') return;
        if (lastTextLen > currentText.length) {
          lastTextLen = 0;
        }
        const delta = currentText.slice(lastTextLen);
        lastTextLen = currentText.length;
        if (delta) onTextDelta(delta);
      },
    });
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

  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const magic = String.fromCharCode(...bytes.slice(0, 4));
  if (magic !== 'GGUF') {
    const ct = res.headers.get('content-type') ?? '';
    throw new Error(`模型文件不是 GGUF（magic=${JSON.stringify(magic)}，content-type=${ct}，URL=${absoluteUrl}）`);
  }
}
