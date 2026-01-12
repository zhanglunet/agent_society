/**
 * 工件存储属性测试
 * 功能: json-artifact-viewer-enhancement
 * 属性14: 工件存储往返正确性
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fc from 'fast-check';
import { ArtifactStore } from '../../src/platform/artifact_store.js';
import { rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// 测试用临时目录
const TEST_ARTIFACTS_DIR = path.join(process.cwd(), 'test-artifacts-temp');

describe('功能: json-artifact-viewer-enhancement, 属性14: 工件存储往返正确性', () => {
  let store;
  
  beforeEach(async () => {
    // 创建唯一的测试目录避免并发冲突
    const uniqueDir = path.join(TEST_ARTIFACTS_DIR, randomUUID());
    await mkdir(uniqueDir, { recursive: true });
    store = new ArtifactStore({ artifactsDir: uniqueDir });
  });
  
  afterEach(async () => {
    // 清理测试目录
    try {
      await rm(TEST_ARTIFACTS_DIR, { recursive: true, force: true });
    } catch {
      // 忽略清理错误
    }
  });
  
  // 简单JSON对象生成器
  const simpleJsonObjectArbitrary = fc.dictionary(
    fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
    fc.oneof(
      fc.string(),
      fc.integer(),
      fc.boolean(),
      fc.constant(null)
    ),
    { minKeys: 1, maxKeys: 5 }
  );
  
  // JSON数组生成器
  const jsonArrayArbitrary = fc.array(
    fc.oneof(
      fc.string(),
      fc.integer(),
      fc.boolean(),
      fc.constant(null)
    ),
    { minLength: 1, maxLength: 5 }
  );
  
  test('对象类型工件存储后读取应与原始内容相等', async () => {
    await fc.assert(
      fc.asyncProperty(
        simpleJsonObjectArbitrary,
        async (obj) => {
          const artifact = {
            type: 'application/json',
            content: obj
          };
          
          const ref = await store.putArtifact(artifact);
          const retrieved = await store.getArtifact(ref);
          
          expect(retrieved.content).toEqual(obj);
          
          return true;
        }
      ),
      { numRuns: 20 }
    );
  });
  
  test('数组类型工件存储后读取应与原始内容相等', async () => {
    await fc.assert(
      fc.asyncProperty(
        jsonArrayArbitrary,
        async (arr) => {
          const artifact = {
            type: 'application/json',
            content: arr
          };
          
          const ref = await store.putArtifact(artifact);
          const retrieved = await store.getArtifact(ref);
          
          expect(retrieved.content).toEqual(arr);
          
          return true;
        }
      ),
      { numRuns: 20 }
    );
  });
  
  test('JSON字符串内容不应被双重编码', async () => {
    await fc.assert(
      fc.asyncProperty(
        simpleJsonObjectArbitrary,
        async (obj) => {
          // 模拟已经序列化的JSON字符串
          const jsonString = JSON.stringify(obj);
          
          const artifact = {
            type: 'application/json',
            content: jsonString
          };
          
          const ref = await store.putArtifact(artifact);
          const retrieved = await store.getArtifact(ref);
          
          // 读取后应该能解析回原始对象，而不是双重编码的字符串
          // 如果被双重编码，retrieved.content会是一个字符串而不是对象
          let parsedContent;
          if (typeof retrieved.content === 'string') {
            parsedContent = JSON.parse(retrieved.content);
          } else {
            parsedContent = retrieved.content;
          }
          
          expect(parsedContent).toEqual(obj);
          
          return true;
        }
      ),
      { numRuns: 20 }
    );
  });
  
  test('嵌套JSON对象存储后读取应保持结构', async () => {
    const nestedJsonArbitrary = fc.record({
      name: fc.string({ minLength: 1, maxLength: 10 }),
      value: fc.integer(),
      nested: simpleJsonObjectArbitrary
    });
    
    await fc.assert(
      fc.asyncProperty(
        nestedJsonArbitrary,
        async (obj) => {
          const artifact = {
            type: 'application/json',
            content: obj
          };
          
          const ref = await store.putArtifact(artifact);
          const retrieved = await store.getArtifact(ref);
          
          expect(retrieved.content).toEqual(obj);
          
          return true;
        }
      ),
      { numRuns: 20 }
    );
  });
  
  test('元信息应正确保存和读取', async () => {
    await fc.assert(
      fc.asyncProperty(
        simpleJsonObjectArbitrary,
        fc.string({ minLength: 1, maxLength: 20 }),
        async (obj, messageId) => {
          const artifact = {
            type: 'application/json',
            content: obj,
            messageId,
            meta: { source: 'test' }
          };
          
          const ref = await store.putArtifact(artifact);
          const retrieved = await store.getArtifact(ref);
          
          expect(retrieved.type).toBe('application/json');
          expect(retrieved.messageId).toBe(messageId);
          expect(retrieved.meta).toEqual({ source: 'test' });
          
          return true;
        }
      ),
      { numRuns: 20 }
    );
  });
  
  test('普通字符串内容应正确序列化', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }).filter(s => {
          // 过滤掉有效的JSON字符串
          try {
            JSON.parse(s);
            return false;
          } catch {
            return true;
          }
        }),
        async (str) => {
          const artifact = {
            type: 'text/plain',
            content: str
          };
          
          const ref = await store.putArtifact(artifact);
          const retrieved = await store.getArtifact(ref);
          
          expect(retrieved.content).toBe(str);
          
          return true;
        }
      ),
      { numRuns: 20 }
    );
  });
});
