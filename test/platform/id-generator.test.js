import { describe, it, expect, beforeEach } from "bun:test";
import { IdGenerator } from "../../src/platform/services/artifact/id_generator.js";

describe("IdGenerator", () => {
  let generator;

  beforeEach(() => {
    generator = new IdGenerator({ stateDir: "/tmp" });
  });

  it("生成UUID格式的ID", async () => {
    const id = await generator.next();
    
    // 验证UUID格式：xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(id).toMatch(uuidRegex);
  });

  it("生成的ID包含版本标识", async () => {
    const id = await generator.next();
    
    // UUID v4的第三段第一个字符应该是4
    const parts = id.split('-');
    expect(parts[2][0]).toBe('4');
  });

  it("生成的ID包含变体�?, async () => {
    const id = await generator.next();
    
    // UUID的第四段第一个字符应该是8�?、a或b
    const parts = id.split('-');
    const variantChar = parts[3][0].toLowerCase();
    expect(['8', '9', 'a', 'b']).toContain(variantChar);
  });

  it("连续生成的ID不同", async () => {
    const id1 = await generator.next();
    const id2 = await generator.next();
    const id3 = await generator.next();
    
    expect(id1).not.toBe(id2);
    expect(id2).not.toBe(id3);
    expect(id1).not.toBe(id3);
  });

  it("基于时间生成，后生成的ID时间戳更�?, async () => {
    const id1 = await generator.next();
    
    // 等待1毫秒确保时间戳不�?
    await new Promise(resolve => setTimeout(resolve, 2));
    
    const id2 = await generator.next();
    
    // 提取时间戳部分（�?2个十六进制字符，去掉连字符）
    const timestamp1 = parseInt(id1.replace(/-/g, '').substring(0, 12), 16);
    const timestamp2 = parseInt(id2.replace(/-/g, '').substring(0, 12), 16);
    
    expect(timestamp2).toBeGreaterThanOrEqual(timestamp1);
  });

  it("并发生成ID不重�?, async () => {
    const promises = [];
    for (let i = 0; i < 100; i++) {
      promises.push(generator.next());
    }
    
    const ids = await Promise.all(promises);
    
    // 所有ID应该不同
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(100);
    
    // 所有ID应该符合UUID格式
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    ids.forEach(id => {
      expect(id).toMatch(uuidRegex);
    });
  });

  it("current()返回新的ID", async () => {
    const current1 = await generator.current();
    const current2 = await generator.current();
    
    // current每次都生成新ID
    expect(current1).not.toBe(current2);
    
    // 都应该是有效的UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(current1).toMatch(uuidRegex);
    expect(current2).toMatch(uuidRegex);
  });

  it("init()可以安全地多次调�?, async () => {
    await generator.init();
    await generator.init();
    await generator.init();
    
    const id = await generator.next();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(id).toMatch(uuidRegex);
  });
});
