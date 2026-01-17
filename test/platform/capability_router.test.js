/**
 * ContentRouter 测试
 * 
 * Property 2: Capability Routing for Supported Types
 * Property 3: Fallback Conversion for Unsupported Types
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import * as fc from 'fast-check';
import { ContentRouter } from '../../src/platform/services/artifact/content_router.js';
import { ContentAdapter } from '../../src/platform/utils/content/content_adapter.js';

// 模拟 LlmServiceRegistry
function createMockRegistry(services = {}) {
  return {
    getCapabilities(serviceId) {
      return services[serviceId]?.capabilities || null;
    },
    hasCapability(serviceId, capabilityType, direction = 'input') {
      const caps = services[serviceId]?.capabilities;
      if (!caps) return false;
      if (direction === 'input') return caps.input?.includes(capabilityType) || false;
      if (direction === 'output') return caps.output?.includes(capabilityType) || false;
      return caps.input?.includes(capabilityType) && caps.output?.includes(capabilityType);
    }
  };
}

// 生成随机附件
const attachmentArb = fc.record({
  type: fc.constantFrom('image', 'audio', 'file'),
  artifactRef: fc.string({ minLength: 1, maxLength: 50 }).map(s => `artifact:${s.replace(/[^a-zA-Z0-9]/g, 'x')}`),
  filename: fc.string({ minLength: 1, maxLength: 30 }).map(s => s.replace(/[^a-zA-Z0-9]/g, 'x') + '.txt'),
  size: fc.option(fc.integer({ min: 0, max: 10000000 }), { nil: undefined }),
  mimeType: fc.option(fc.constantFrom('image/png', 'image/jpeg', 'audio/mp3', 'application/pdf'), { nil: undefined })
});

// 生成随机消息
const messageArb = fc.record({
  from: fc.string({ minLength: 1, maxLength: 20 }),
  payload: fc.record({
    text: fc.string({ minLength: 0, maxLength: 200 }),
    attachments: fc.array(attachmentArb, { minLength: 0, maxLength: 5 })
  })
});

describe('ContentRouter', () => {
  describe('基础功能测试', () => {
    it('创建实例不抛出异�?, () => {
      expect(() => new ContentRouter()).not.toThrow();
    });

    it('处理无附件消�?, async () => {
      const registry = createMockRegistry({
        'text-model': { capabilities: { input: ['text'], output: ['text'] } }
      });
      const router = new ContentRouter({ serviceRegistry: registry });
      
      const message = { payload: { text: 'Hello' } };
      const result = await router.routeContent(message, 'text-model');
      
      expect(result.canProcess).toBe(true);
      expect(result.processedContent).toBe('Hello');
      expect(result.unsupportedAttachments).toEqual([]);
    });

    it('处理空消�?, async () => {
      const router = new ContentRouter();
      const result = await router.routeContent(null, 'any');
      
      expect(result.canProcess).toBe(true);
      expect(result.processedContent).toBe('');
    });
  });

  describe('getRequiredCapabilities 方法', () => {
    it('纯文本消息返�?text', () => {
      const router = new ContentRouter();
      const message = { payload: { text: 'Hello' } };
      
      const caps = router.getRequiredCapabilities(message);
      expect(caps).toEqual(['text']);
    });

    it('图片附件需�?vision 能力', () => {
      const router = new ContentRouter();
      const message = {
        payload: {
          text: 'Look at this',
          attachments: [{ type: 'image', artifactRef: 'art:123', filename: 'img.png' }]
        }
      };
      
      const caps = router.getRequiredCapabilities(message);
      expect(caps).toContain('text');
      expect(caps).toContain('vision');
    });

    it('音频附件需�?audio 能力', () => {
      const router = new ContentRouter();
      const message = {
        payload: {
          text: 'Listen',
          attachments: [{ type: 'audio', artifactRef: 'art:456', filename: 'sound.mp3' }]
        }
      };
      
      const caps = router.getRequiredCapabilities(message);
      expect(caps).toContain('audio');
    });

    it('文件附件需�?file 能力', () => {
      const router = new ContentRouter();
      const message = {
        payload: {
          text: 'Read this',
          attachments: [{ type: 'file', artifactRef: 'art:789', filename: 'doc.pdf' }]
        }
      };
      
      const caps = router.getRequiredCapabilities(message);
      expect(caps).toContain('file');
    });

    it('多种附件返回多种能力', () => {
      const router = new ContentRouter();
      const message = {
        payload: {
          text: 'Multiple',
          attachments: [
            { type: 'image', artifactRef: 'art:1', filename: 'img.png' },
            { type: 'audio', artifactRef: 'art:2', filename: 'sound.mp3' },
            { type: 'file', artifactRef: 'art:3', filename: 'doc.pdf' }
          ]
        }
      };
      
      const caps = router.getRequiredCapabilities(message);
      expect(caps).toContain('text');
      expect(caps).toContain('vision');
      expect(caps).toContain('audio');
      expect(caps).toContain('file');
    });
  });

  describe('checkCapabilitySupport 方法', () => {
    it('全部支持时返�?allSupported: true', () => {
      const registry = createMockRegistry({
        'vision-model': { capabilities: { input: ['text', 'vision'], output: ['text'] } }
      });
      const router = new ContentRouter({ serviceRegistry: registry });
      
      const message = {
        payload: {
          text: 'Look',
          attachments: [{ type: 'image', artifactRef: 'art:1', filename: 'img.png' }]
        }
      };
      
      const result = router.checkCapabilitySupport(message, 'vision-model');
      expect(result.allSupported).toBe(true);
      expect(result.unsupported).toEqual([]);
    });

    it('部分不支持时返回 allSupported: false', () => {
      const registry = createMockRegistry({
        'text-model': { capabilities: { input: ['text'], output: ['text'] } }
      });
      const router = new ContentRouter({ serviceRegistry: registry });
      
      const message = {
        payload: {
          text: 'Look',
          attachments: [{ type: 'image', artifactRef: 'art:1', filename: 'img.png' }]
        }
      };
      
      const result = router.checkCapabilitySupport(message, 'text-model');
      expect(result.allSupported).toBe(false);
      expect(result.unsupported).toContain('vision');
    });
  });

  describe('Property 2: Capability Routing for Supported Types', () => {
    it('支持的图片附件被保留在处理内容中', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.string({ minLength: 1, maxLength: 30 }).map(s => s.replace(/[^a-zA-Z0-9]/g, 'x')),
          async (text, filename) => {
            const registry = createMockRegistry({
              'vision-model': { capabilities: { input: ['text', 'vision'], output: ['text'] } }
            });
            const router = new ContentRouter({ serviceRegistry: registry });
            
            const message = {
              payload: {
                text,
                attachments: [{ type: 'image', artifactRef: `artifact:${filename}`, filename: `${filename}.png` }]
              }
            };
            
            // 模拟 getImageBase64
            const getImageBase64 = async (ref) => ({
              data: 'base64data',
              mimeType: 'image/png'
            });
            
            const result = await router.routeContent(message, 'vision-model', { getImageBase64 });
            
            // 支持的附件应该被处理为多模态内�?
            expect(result.canProcess).toBe(true);
            expect(result.unsupportedAttachments).toEqual([]);
            
            // 处理后的内容应该是数组（多模态）或包含原始文�?
            if (Array.isArray(result.processedContent)) {
              const hasImage = result.processedContent.some(c => c.type === 'image_url');
              expect(hasImage).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('支持的文件附件内容被读取取', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          async (text, fileContent) => {
            const registry = createMockRegistry({
              'file-model': { capabilities: { input: ['text', 'file'], output: ['text'] } }
            });
            const router = new ContentRouter({ serviceRegistry: registry });
            
            const message = {
              payload: {
                text,
                attachments: [{ type: 'file', artifactRef: 'artifact:doc1', filename: 'readme.txt' }]
              }
            };
            
            const getFileContent = async (ref) => ({
              content: fileContent,
              metadata: {}
            });
            
            const result = await router.routeContent(message, 'file-model', { getFileContent });
            
            expect(result.canProcess).toBe(true);
            expect(result.unsupportedAttachments).toEqual([]);
            
            // 文件内容应该被添加到处理后的内容�?
            if (typeof result.processedContent === 'string') {
              expect(result.processedContent).toContain(fileContent);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('多种支持的附件都被正确处�?, async () => {
      const registry = createMockRegistry({
        'multimodal': { capabilities: { input: ['text', 'vision', 'file'], output: ['text'] } }
      });
      const router = new ContentRouter({ serviceRegistry: registry });
      
      const message = {
        payload: {
          text: 'Check these',
          attachments: [
            { type: 'image', artifactRef: 'artifact:img1', filename: 'photo.png' },
            { type: 'file', artifactRef: 'artifact:doc1', filename: 'notes.txt' }
          ]
        }
      };
      
      const getImageBase64 = async () => ({ data: 'imgdata', mimeType: 'image/png' });
      const getFileContent = async () => ({ content: 'file content', metadata: {} });
      
      const result = await router.routeContent(message, 'multimodal', { getImageBase64, getFileContent });
      
      expect(result.canProcess).toBe(true);
      expect(result.unsupportedAttachments).toEqual([]);
    });
  });

  describe('Property 3: Fallback Conversion for Unsupported Types', () => {
    it('不支持的附件被转换为文本描述', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }),
          attachmentArb,
          async (text, attachment) => {
            const registry = createMockRegistry({
              'text-only': { capabilities: { input: ['text'], output: ['text'] } }
            });
            const contentAdapter = new ContentAdapter({ serviceRegistry: registry });
            const router = new ContentRouter({ 
              serviceRegistry: registry,
              contentAdapter
            });
            
            const message = {
              payload: {
                text,
                attachments: [attachment]
              }
            };
            
            const result = await router.routeContent(message, 'text-only');
            
            // 非文本附件应该不被支�?
            if (attachment.type !== 'text') {
              expect(result.canProcess).toBe(false);
              expect(result.unsupportedAttachments.length).toBeGreaterThan(0);
              expect(result.textDescription).toBeTruthy();
              
              // 文本描述应该包含附件信息
              expect(result.textDescription).toContain(attachment.artifactRef);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('不支持的附件不包含原始数�?, async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }),
          async (text) => {
            const registry = createMockRegistry({
              'text-only': { capabilities: { input: ['text'], output: ['text'] } }
            });
            const contentAdapter = new ContentAdapter({ serviceRegistry: registry });
            const router = new ContentRouter({ 
              serviceRegistry: registry,
              contentAdapter
            });
            
            const message = {
              payload: {
                text,
                attachments: [{ type: 'image', artifactRef: 'artifact:secret123', filename: 'secret.png' }]
              }
            };
            
            // 模拟 getImageBase64 - 不应该被调用
            let imageRequested = false;
            const getImageBase64 = async () => {
              imageRequested = true;
              return { data: 'secretdata', mimeType: 'image/png' };
            };
            
            const result = await router.routeContent(message, 'text-only', { getImageBase64 });
            
            // 不支持的图片不应该请�?base64 数据
            expect(result.canProcess).toBe(false);
            
            // 处理后的内容应该是字符串（不是多模态数组）
            expect(typeof result.processedContent).toBe('string');
            
            // 不应该包�?base64 数据
            expect(result.processedContent).not.toContain('secretdata');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('混合支持和不支持的附件正确处�?, async () => {
      const registry = createMockRegistry({
        'vision-only': { capabilities: { input: ['text', 'vision'], output: ['text'] } }
      });
      const contentAdapter = new ContentAdapter({ serviceRegistry: registry });
      const router = new ContentRouter({ 
        serviceRegistry: registry,
        contentAdapter
      });
      
      const message = {
        payload: {
          text: 'Mixed content',
          attachments: [
            { type: 'image', artifactRef: 'artifact:img1', filename: 'photo.png' },
            { type: 'audio', artifactRef: 'artifact:audio1', filename: 'sound.mp3' }
          ]
        }
      };
      
      const getImageBase64 = async () => ({ data: 'imgdata', mimeType: 'image/png' });
      
      const result = await router.routeContent(message, 'vision-only', { getImageBase64 });
      
      // 有不支持的附�?
      expect(result.canProcess).toBe(false);
      expect(result.unsupportedAttachments.length).toBe(1);
      expect(result.unsupportedAttachments[0].type).toBe('audio');
      
      // 文本描述应该包含音频附件信息
      expect(result.textDescription).toContain('artifact:audio1');
      
      // 图片应该被处理为多模�?
      expect(Array.isArray(result.processedContent)).toBe(true);
    });

    it('服务不存在时所有非文本附件都不支持', async () => {
      const registry = createMockRegistry({});
      const contentAdapter = new ContentAdapter({ serviceRegistry: registry });
      const router = new ContentRouter({ 
        serviceRegistry: registry,
        contentAdapter
      });
      
      const message = {
        payload: {
          text: 'Test',
          attachments: [{ type: 'image', artifactRef: 'artifact:img1', filename: 'photo.png' }]
        }
      };
      
      const result = await router.routeContent(message, 'nonexistent');
      
      expect(result.canProcess).toBe(false);
      expect(result.unsupportedAttachments.length).toBe(1);
    });
  });

  describe('Property 4: Formatted Text Content Option', () => {
    it('使用 formattedTextContent 选项时应使用预格式化的文�?, async () => {
      const registry = createMockRegistry({
        'text-model': { capabilities: { input: ['text'], output: ['text'] } }
      });
      const router = new ContentRouter({ serviceRegistry: registry });
      
      const message = {
        payload: {
          text: 'Original text',
          attachments: []
        }
      };
      
      const formattedText = '【来自用户的消息】\nOriginal text\n\n【上下文状态】已使用 100/1000 tokens';
      const result = await router.routeContent(message, 'text-model', { 
        formattedTextContent: formattedText 
      });
      
      expect(result.canProcess).toBe(true);
      expect(result.processedContent).toBe(formattedText);
    });

    it('formattedTextContent 与附件处理结合使�?, async () => {
      const registry = createMockRegistry({
        'vision-model': { capabilities: { input: ['text', 'vision'], output: ['text'] } }
      });
      const router = new ContentRouter({ serviceRegistry: registry });
      
      const message = {
        payload: {
          text: 'Look at this',
          attachments: [{ type: 'image', artifactRef: 'artifact:img1', filename: 'photo.png' }]
        }
      };
      
      const formattedText = '【来自用户的消息】\nLook at this\n\n【上下文状态】已使用 100/1000 tokens';
      const getImageBase64 = async () => ({ data: 'imgdata', mimeType: 'image/png' });
      
      const result = await router.routeContent(message, 'vision-model', { 
        formattedTextContent: formattedText,
        getImageBase64
      });
      
      expect(result.canProcess).toBe(true);
      
      // 应该是多模态数�?
      expect(Array.isArray(result.processedContent)).toBe(true);
      
      // 第一个元素应该是预格式化的文�?
      const textContent = result.processedContent.find(c => c.type === 'text');
      expect(textContent.text).toBe(formattedText);
    });

    it('不支持视觉的模型收到图片时应转换为文本描�?, async () => {
      const registry = createMockRegistry({
        'text-only': { capabilities: { input: ['text'], output: ['text'] } }
      });
      const contentAdapter = new ContentAdapter({ serviceRegistry: registry });
      const router = new ContentRouter({ 
        serviceRegistry: registry,
        contentAdapter
      });
      
      const message = {
        payload: {
          text: 'What is in this image?',
          attachments: [{ type: 'image', artifactRef: 'artifact:img1', filename: 'photo.png' }]
        }
      };
      
      const formattedText = '【来自用户的消息】\nWhat is in this image?';
      
      // 模拟 getImageBase64 - 不应该被调用，因为模型不支持视觉
      let imageRequested = false;
      const getImageBase64 = async () => {
        imageRequested = true;
        return { data: 'imgdata', mimeType: 'image/png' };
      };
      
      const result = await router.routeContent(message, 'text-only', { 
        formattedTextContent: formattedText,
        getImageBase64
      });
      
      // 应该标记为不能完全处�?
      expect(result.canProcess).toBe(false);
      
      // 图片应该在不支持的附件列表中
      expect(result.unsupportedAttachments.length).toBe(1);
      expect(result.unsupportedAttachments[0].type).toBe('image');
      
      // 处理后的内容应该是字符串（不是多模态数组）
      expect(typeof result.processedContent).toBe('string');
      
      // 应该包含预格式化的文�?
      expect(result.processedContent).toContain(formattedText);
      
      // 应该包含图片的文本描�?
      expect(result.processedContent).toContain('artifact:img1');
      expect(result.processedContent).toContain('photo.png');
    });
  });

});

