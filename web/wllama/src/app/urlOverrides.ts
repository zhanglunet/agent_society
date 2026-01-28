import type { AppDom } from './ui';

export type UrlOverrides = {
  modelUrl?: string;
  nCtx?: number;
  nPredict?: number;
  temp?: number;
  topK?: number;
  topP?: number;
  systemPrompt?: string;
  stream?: boolean;
  autoLoad?: boolean;
};

export function readUrlOverrides(url: string): UrlOverrides {
  const u = new URL(url, 'http://localhost/');
  return readUrlOverridesFromParams(u.searchParams);
}

export function readUrlOverridesFromParams(params: URLSearchParams): UrlOverrides {
  const modelUrl = pickString(params, ['modelUrl', 'model', 'm']);
  const systemPrompt = pickString(params, ['systemPrompt', 'system', 'prompt', 'sp']);

  const nCtx = pickNumber(params, ['nCtx', 'ctx'], true);
  const nPredict = pickNumber(params, ['nPredict', 'predict'], true);
  const temp = pickNumber(params, ['temp', 'temperature'], false);
  const topK = pickNumber(params, ['topK', 'top_k'], true);
  const topP = pickNumber(params, ['topP', 'top_p'], false);

  const stream = pickBool(params, ['stream', 'streamOutput', 's']);
  const autoLoad = pickBool(params, ['autoLoad', 'autoload', 'load', 'loadModel']);

  const out: UrlOverrides = {};
  if (modelUrl !== undefined) out.modelUrl = modelUrl;
  if (systemPrompt !== undefined) out.systemPrompt = systemPrompt;
  if (nCtx !== undefined) out.nCtx = nCtx;
  if (nPredict !== undefined) out.nPredict = nPredict;
  if (temp !== undefined) out.temp = temp;
  if (topK !== undefined) out.topK = topK;
  if (topP !== undefined) out.topP = topP;
  if (stream !== undefined) out.stream = stream;
  if (autoLoad !== undefined) out.autoLoad = autoLoad;
  return out;
}

export function applyUrlOverrides(dom: AppDom, overrides: UrlOverrides): void {
  if (overrides.modelUrl !== undefined) dom.modelUrl.value = overrides.modelUrl;
  if (overrides.systemPrompt !== undefined) dom.systemPrompt.value = overrides.systemPrompt;
  if (overrides.nCtx !== undefined) dom.nCtx.value = String(overrides.nCtx);
  if (overrides.nPredict !== undefined) dom.nPredict.value = String(overrides.nPredict);
  if (overrides.temp !== undefined) dom.temp.value = String(overrides.temp);
  if (overrides.topK !== undefined) dom.topK.value = String(overrides.topK);
  if (overrides.topP !== undefined) dom.topP.value = String(overrides.topP);
  if (overrides.stream !== undefined) setToggleButton(dom.btnToggleStream, overrides.stream);
}

export function setToggleButton(btn: { setAttribute: (k: string, v: string) => void; textContent: string | null }, enabled: boolean): void {
  btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  btn.textContent = enabled ? '开' : '关';
}

function pickString(params: URLSearchParams, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = params.get(k);
    if (v !== null) return v;
  }
  return undefined;
}

function pickNumber(params: URLSearchParams, keys: string[], integer: boolean): number | undefined {
  for (const k of keys) {
    const v = params.get(k);
    if (v === null) continue;
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    return integer ? Math.trunc(n) : n;
  }
  return undefined;
}

function pickBool(params: URLSearchParams, keys: string[]): boolean | undefined {
  for (const k of keys) {
    const v = params.get(k);
    if (v === null) continue;
    const s = v.trim().toLowerCase();
    if (s === '1' || s === 'true' || s === 'yes' || s === 'on') return true;
    if (s === '0' || s === 'false' || s === 'no' || s === 'off') return false;
  }
  return undefined;
}
