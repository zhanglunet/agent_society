import type { AppState, ChatMessage, GenerationParams, ModelLoadParams } from './state';
import { createInitialState } from './state';
import { getAppDom, render, setInputValue } from './ui';
import { clampNumber, parseNumberOr } from '../utils/dom';
import { createWllamaEngine } from '../llm/wllamaEngine';

export function createApp(doc: Document): void {
  const dom = getAppDom(doc);
  const engine = createWllamaEngine();

  let state: AppState = createInitialState();
  let generationAbort: AbortController | null = null;
  let generationSeq = 0;

  const setState = (next: AppState) => {
    state = next;
    render(dom, state);
  };

  const updateStatus = (next: AppState['status']) => setState({ ...state, status: next });

  setState(state);

  dom.btnLoadFromUrl.addEventListener('click', async () => {
    if (state.status.kind === 'loadingModel' || state.status.kind === 'generating') return;
    const loadParams = readModelLoadParams(dom);
    try {
      updateStatus({ kind: 'loadingModel', text: '正在加载模型...', progress: 0 });
      await engine.loadFromUrl(loadParams, (progress) => {
        updateStatus({ kind: 'loadingModel', text: '正在加载模型...', progress });
      });
      const runtime = engine.getRuntimeInfo();
      const modeText = runtime.crossOriginIsolated ? '多线程' : '单线程';
      setState({
        ...state,
        status: {
          kind: 'ready',
          text: `模型已加载（${modeText}，threads=${runtime.threads}，batch=${runtime.batchSize}）`,
        },
        model: { loaded: true },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setState({ ...state, status: { kind: 'error', text: `加载失败：${message}` }, model: { loaded: false } });
    }
  });

  dom.btnUnload.addEventListener('click', async () => {
    if (state.status.kind === 'loadingModel' || state.status.kind === 'generating') return;
    try {
      updateStatus({ kind: 'idle', text: '正在卸载...' });
      await engine.unload();
      setState({
        ...state,
        status: { kind: 'idle', text: '未加载模型' },
        model: { loaded: false },
        messages: [],
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setState({ ...state, status: { kind: 'error', text: `卸载失败：${message}` } });
    }
  });

  dom.btnSend.addEventListener('click', async () => {
    await onSend();
  });

  dom.btnStop.addEventListener('click', () => {
    generationAbort?.abort();
  });

  dom.chatInput.addEventListener('keydown', async (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      await onSend();
    }
  });

  async function onSend(): Promise<void> {
    if (!state.model.loaded) return;
    if (state.status.kind === 'loadingModel' || state.status.kind === 'generating') return;
    const text = dom.chatInput.value.trim();
    if (!text) return;

    setInputValue(dom, '');

    const messagesInFlight = appendUserMessage(state.messages, text);
    const assistantIndex = messagesInFlight.length;
    messagesInFlight.push({ role: 'assistant', content: '' });
    setState({ ...state, messages: messagesInFlight, status: { kind: 'generating', text: '生成中...' } });

    const genParams = readGenerationParams(dom);
    generationAbort = new AbortController();
    generationSeq += 1;
    const mySeq = generationSeq;

    let finished = false;
    try {
      let assistantText = '';
      let scheduled = false;

      const flush = () => {
        if (generationSeq !== mySeq) return;
        messagesInFlight[assistantIndex] = { role: 'assistant', content: assistantText };
        setState({ ...state, messages: messagesInFlight, status: { kind: 'generating', text: '生成中...' } });
      };

      const scheduleFlush = () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
          scheduled = false;
          flush();
        });
      };

      await engine.chat(messagesInFlight, genParams, generationAbort.signal, (deltaText) => {
        if (generationSeq !== mySeq) return;
        assistantText += deltaText;
        scheduleFlush();
      });
      if (generationSeq === mySeq) {
        flush();
      }
      finished = true;
    } catch (e) {
      const aborted = generationAbort.signal.aborted;
      generationAbort = null;
      if (generationSeq === mySeq) generationSeq += 1;
      if (aborted) {
        setState({ ...state, status: { kind: 'ready', text: '已停止' } });
        return;
      }
      const message = e instanceof Error ? e.message : String(e);
      setState({ ...state, status: { kind: 'error', text: `生成失败：${message}` } });
    } finally {
      generationAbort = null;
      if (generationSeq === mySeq) generationSeq += 1;
      if (finished) {
        setState({ ...state, status: { kind: 'ready', text: '就绪' } });
      }
    }
  }
}

function readModelLoadParams(dom: { modelUrl: HTMLInputElement; nCtx: HTMLInputElement }): ModelLoadParams {
  return {
    modelUrl: dom.modelUrl.value.trim(),
    nCtx: clampNumber(parseNumberOr(dom.nCtx.value, 2048), 256, 16384),
  };
}

function readGenerationParams(dom: {
  nPredict: HTMLInputElement;
  temp: HTMLInputElement;
  topK: HTMLInputElement;
  topP: HTMLInputElement;
}): GenerationParams {
  return {
    nPredict: clampNumber(parseNumberOr(dom.nPredict.value, 256), 1, 4096),
    temp: clampNumber(parseNumberOr(dom.temp.value, 0.7), 0, 5),
    topK: clampNumber(parseNumberOr(dom.topK.value, 40), 0, 200),
    topP: clampNumber(parseNumberOr(dom.topP.value, 0.9), 0, 1),
  };
}

function appendUserMessage(existing: ChatMessage[], text: string): ChatMessage[] {
  const messages = [...existing];
  if (!messages.some((m) => m.role === 'system')) {
    messages.unshift({ role: 'system', content: '你是一个有帮助的助手。' });
  }
  messages.push({ role: 'user', content: text });
  return messages;
}
