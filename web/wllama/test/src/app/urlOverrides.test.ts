import { describe, expect, test } from 'bun:test';
import { applyUrlOverrides, readUrlOverrides } from '../../../src/app/urlOverrides';

function createButtonStub() {
  const attrs = new Map<string, string>();
  return {
    textContent: '',
    setAttribute: (k: string, v: string) => {
      attrs.set(k, v);
    },
    getAttribute: (k: string) => attrs.get(k) ?? null,
  };
}

describe('urlOverrides', () => {
  test('reads overrides with aliases', () => {
    const o = readUrlOverrides('http://localhost/?ctx=4096&predict=777&top_k=12&top_p=0.5&stream=0&model=a.gguf&sp=SYS&autoload=1');
    expect(o.nCtx).toBe(4096);
    expect(o.nPredict).toBe(777);
    expect(o.topK).toBe(12);
    expect(o.topP).toBe(0.5);
    expect(o.stream).toBe(false);
    expect(o.modelUrl).toBe('a.gguf');
    expect(o.systemPrompt).toBe('SYS');
    expect(o.autoLoad).toBe(true);
  });

  test('applies overrides to dom fields and stream toggle', () => {
    const btn = createButtonStub();
    const dom: any = {
      modelUrl: { value: '' },
      nCtx: { value: '' },
      nPredict: { value: '' },
      temp: { value: '' },
      topK: { value: '' },
      topP: { value: '' },
      systemPrompt: { value: '' },
      btnToggleStream: btn,
    };
    applyUrlOverrides(dom, { modelUrl: 'm', nCtx: 1, nPredict: 2, temp: 0.7, topK: 3, topP: 0.9, systemPrompt: 'S', stream: true });
    expect(dom.modelUrl.value).toBe('m');
    expect(dom.nCtx.value).toBe('1');
    expect(dom.nPredict.value).toBe('2');
    expect(dom.temp.value).toBe('0.7');
    expect(dom.topK.value).toBe('3');
    expect(dom.topP.value).toBe('0.9');
    expect(dom.systemPrompt.value).toBe('S');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(btn.textContent).toBe('开');
  });
});
