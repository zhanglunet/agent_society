import type { AppState, ChatMessage } from './state';
import { mustGetElement } from '../utils/dom';

export type AppDom = {
  statusText: HTMLElement;
  progressFill: HTMLElement;
  progressText: HTMLElement;
  modelUrl: HTMLInputElement;
  nCtx: HTMLInputElement;
  nPredict: HTMLInputElement;
  temp: HTMLInputElement;
  topK: HTMLInputElement;
  topP: HTMLInputElement;
  btnLoadFromUrl: HTMLButtonElement;
  btnUnload: HTMLButtonElement;
  chatList: HTMLElement;
  chatInput: HTMLTextAreaElement;
  btnSend: HTMLButtonElement;
  btnStop: HTMLButtonElement;
};

export function getAppDom(doc: Document): AppDom {
  return {
    statusText: mustGetElement(doc, '#statusText'),
    progressFill: mustGetElement(doc, '#progressFill'),
    progressText: mustGetElement(doc, '#progressText'),
    modelUrl: mustGetElement(doc, '#modelUrl'),
    nCtx: mustGetElement(doc, '#nCtx'),
    nPredict: mustGetElement(doc, '#nPredict'),
    temp: mustGetElement(doc, '#temp'),
    topK: mustGetElement(doc, '#topK'),
    topP: mustGetElement(doc, '#topP'),
    btnLoadFromUrl: mustGetElement(doc, '#btnLoadFromUrl'),
    btnUnload: mustGetElement(doc, '#btnUnload'),
    chatList: mustGetElement(doc, '#chatList'),
    chatInput: mustGetElement(doc, '#chatInput'),
    btnSend: mustGetElement(doc, '#btnSend'),
    btnStop: mustGetElement(doc, '#btnStop'),
  };
}

export function render(dom: AppDom, state: AppState): void {
  dom.statusText.textContent = state.status.text;
  if (state.status.kind === 'loadingModel') {
    const percent = Math.max(0, Math.min(100, Math.round(state.status.progress * 100)));
    dom.progressFill.style.width = `${percent}%`;
    dom.progressText.textContent = `${percent}%`;
  } else {
    dom.progressFill.style.width = `0%`;
    dom.progressText.textContent = `0%`;
  }

  const controlsDisabled = state.status.kind === 'loadingModel' || state.status.kind === 'generating';
  dom.btnLoadFromUrl.disabled = controlsDisabled;
  dom.btnUnload.disabled = controlsDisabled || !state.model.loaded;
  dom.btnSend.disabled = controlsDisabled || !state.model.loaded;
  dom.btnStop.disabled = state.status.kind !== 'generating';

  renderMessages(dom.chatList, state.messages);
}

function renderMessages(container: HTMLElement, messages: ChatMessage[]): void {
  const view = messages.filter((m) => m.role !== 'system');
  const shouldAutoScroll = isNearBottom(container, 40);

  const existing = container.children;
  if (existing.length === view.length) {
    let structureOk = true;
    for (let i = 0; i < view.length; i += 1) {
      const msg = view[i];
      const el = existing.item(i) as HTMLElement | null;
      if (!el) {
        structureOk = false;
        break;
      }
      if (el.dataset.role !== msg.role) {
        structureOk = false;
        break;
      }
    }

    if (structureOk) {
      for (let i = 0; i < view.length; i += 1) {
        const msg = view[i];
        const el = existing.item(i) as HTMLElement | null;
        if (!el) continue;
        const contentEl = el.children.item(1) as HTMLElement | null;
        if (!contentEl) continue;
        if (contentEl.textContent !== msg.content) {
          contentEl.textContent = msg.content;
        }
      }
      if (shouldAutoScroll) {
        container.scrollTop = container.scrollHeight;
      }
      return;
    }
  }

  container.textContent = '';
  for (const msg of view) {
    const el = container.ownerDocument.createElement('div');
    el.className = `msg ${msg.role}`;
    el.dataset.role = msg.role;
    const meta = container.ownerDocument.createElement('div');
    meta.className = 'msg-meta';
    meta.textContent = msg.role === 'user' ? '用户' : '助手';
    const content = container.ownerDocument.createElement('div');
    content.className = 'msg-content';
    content.textContent = msg.content;
    el.appendChild(meta);
    el.appendChild(content);
    container.appendChild(el);
  }
  if (shouldAutoScroll) {
    container.scrollTop = container.scrollHeight;
  }
}

export function setInputValue(dom: AppDom, value: string): void {
  dom.chatInput.value = value;
}

function isNearBottom(container: HTMLElement, thresholdPx: number): boolean {
  const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
  return distance <= thresholdPx;
}
