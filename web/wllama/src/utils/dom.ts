export function mustGetElement<T extends Element>(doc: Document, selector: string): T {
  const el = doc.querySelector(selector);
  if (!el) {
    throw new Error(`找不到元素：${selector}`);
  }
  return el as T;
}

export function parseNumberOr(raw: string, fallback: number): number {
  const v = Number(raw);
  return Number.isFinite(v) ? v : fallback;
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

