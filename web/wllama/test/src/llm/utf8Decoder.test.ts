import { describe, expect, test } from 'bun:test';

describe('utf8 streaming decode', () => {
  test('does not produce replacement chars when bytes split in middle', () => {
    const enc = new TextEncoder();
    const bytes = enc.encode('你好，世界');
    const p1 = bytes.slice(0, 4);
    const p2 = bytes.slice(4, 7);
    const p3 = bytes.slice(7);

    const dec = new TextDecoder('utf-8');
    const s1 = dec.decode(p1, { stream: true });
    const s2 = dec.decode(p2, { stream: true });
    const s3 = dec.decode(p3, { stream: true });
    const tail = dec.decode();

    const out = `${s1}${s2}${s3}${tail}`;
    expect(out).toBe('你好，世界');
    expect(out.includes('\uFFFD')).toBe(false);
  });
});

