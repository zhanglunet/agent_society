/**
 * Tests for ArtifactContentRouter
 * 
 * Requirements: 1, 2, 3, 4, 5, 6, 7, 8
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ContentRouter } from '../../src/platform/services/artifact/content_router.js';

describe('ContentRouter', () => {
  let router;
  let mockServiceRegistry;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {}
    };

    mockServiceRegistry = {
      getCapabilities: (serviceId) => {
        if (serviceId === 'vision-service') {
          return { input: ['text', 'vision'], output: ['text'] };
        }
        if (serviceId === 'file-service') {
          return { input: ['text', 'file'], output: ['text'] };
        }
        if (serviceId === 'text-only-service') {
          return { input: ['text'], output: ['text'] };
        }
        return null;
      }
    };

    router = new ContentRouter({
      serviceRegistry: mockServiceRegistry,
      logger: mockLogger
    });
  });

  describe('Constructor', () => {
    it('should create instance with all parameters', () => {
      expect(router).toBeDefined();
      expect(router.serviceRegistry).toBe(mockServiceRegistry);
      expect(router.logger).toBe(mockLogger);
    });

    it('should handle empty parameters', () => {
      const emptyRouter = new ContentRouter();
      expect(emptyRouter).toBeDefined();
      expect(emptyRouter.serviceRegistry).toBeNull();
    });
  });

  describe('detectBinaryType', () => {
    it('should detect image from MIME type - jpeg', () => {
      const artifact = { mimeType: 'image/jpeg' };
      const result = router.detectBinaryType(artifact);
      expect(result.type).toBe('image');
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    it('should detect image from MIME type - png', () => {
      const artifact = { mimeType: 'image/png' };
      const result = router.detectBinaryType(artifact);
      expect(result.type).toBe('image');
    });

    it('should detect audio from MIME type', () => {
      const artifact = { mimeType: 'audio/mp3' };
      const result = router.detectBinaryType(artifact);
      expect(result.type).toBe('audio');
    });

    it('should detect video from MIME type', () => {
      const artifact = { mimeType: 'video/mp4' };
      const result = router.detectBinaryType(artifact);
      expect(result.type).toBe('video');
    });

    it('should detect document from MIME type', () => {
      const artifact = { mimeType: 'application/pdf' };
      const result = router.detectBinaryType(artifact);
      expect(result.type).toBe('document');
    });

    it('should detect image from extension - .jpg', () => {
      const artifact = { meta: { filename: 'photo.jpg' } };
      const result = router.detectBinaryType(artifact);
      expect(result.type).toBe('image');
    });

    it('should detect image from extension - .png', () => {
      const artifact = { meta: { filename: 'screenshot.png' } };
      const result = router.detectBinaryType(artifact);
      expect(result.type).toBe('image');
    });

    it('should detect audio from extension', () => {
      const artifact = { meta: { filename: 'song.mp3' } };
      const result = router.detectBinaryType(artifact);
      expect(result.type).toBe('audio');
    });

    it('should detect document from extension', () => {
      const artifact = { meta: { filename: 'report.pdf' } };
      const result = router.detectBinaryType(artifact);
      expect(result.type).toBe('document');
    });

    it('should fallback to other for unknown type', () => {
      const artifact = { mimeType: 'application/unknown' };
      const result = router.detectBinaryType(artifact);
      expect(result.type).toBe('other');
    });

    it('should prioritize MIME type over extension', () => {
      const artifact = { 
        mimeType: 'image/jpeg',
        meta: { filename: 'file.pdf' }
      };
      const result = router.detectBinaryType(artifact);
      expect(result.type).toBe('image');
    });
  });

  describe('hasCapability', () => {
    it('should return true when service has vision capability', () => {
      const result = router.hasCapability('vision-service', 'vision');
      expect(result).toBe(true);
    });

    it('should return false when service lacks vision capability', () => {
      const result = router.hasCapability('text-only-service', 'vision');
      expect(result).toBe(false);
    });

    it('should return true when service has file capability', () => {
      const result = router.hasCapability('file-service', 'file');
      expect(result).toBe(true);
    });

    it('should return false when service lacks file capability', () => {
      const result = router.hasCapability('text-only-service', 'file');
      expect(result).toBe(false);
    });

    it('should return false when serviceRegistry unavailable', () => {
      const noRegistryRouter = new ContentRouter({ logger: mockLogger });
      const result = noRegistryRouter.hasCapability('any-service', 'vision');
      expect(result).toBe(false);
    });

    it('should return false when serviceId not found', () => {
      const result = router.hasCapability('unknown-service', 'vision');
      expect(result).toBe(false);
    });
  });

  describe('routeContent - text content', () => {
    it('should return text routing for plain text', async () => {
      const artifact = {
        isBinary: false,
        content: 'Hello world',
        id: 'test-1',
        type: 'text'
      };
      const result = await router.routeContent(artifact, 'any-service');
      expect(result.routing).toBe('text');
      expect(result.contentType).toBe('text');
      expect(result.content).toBe('Hello world');
    });

    it('should not encode text content', async () => {
      const artifact = {
        isBinary: false,
        content: 'Plain text content',
        id: 'test-2'
      };
      const result = await router.routeContent(artifact, 'any-service');
      expect(result.content).toBe('Plain text content');
      expect(result.content).not.toMatch(/^[A-Za-z0-9+/]+=*$/);
    });

    it('should handle empty string', async () => {
      const artifact = {
        isBinary: false,
        content: '',
        id: 'test-3'
      };
      const result = await router.routeContent(artifact, 'any-service');
      expect(result.routing).toBe('text');
      expect(result.content).toBe('');
    });

    it('should handle special characters', async () => {
      const artifact = {
        isBinary: false,
        content: 'Special: !@#$%^&*()',
        id: 'test-4'
      };
      const result = await router.routeContent(artifact, 'any-service');
      expect(result.content).toBe('Special: !@#$%^&*()');
    });

    it('should handle Unicode characters', async () => {
      const artifact = {
        isBinary: false,
        content: '你好世界 🌍',
        id: 'test-5'
      };
      const result = await router.routeContent(artifact, 'any-service');
      expect(result.content).toBe('你好世界 🌍');
    });
  });

  describe('routeContent - image content', () => {
    it('should route image to image_url with vision capability', async () => {
      const artifact = {
        isBinary: true,
        content: 'base64imagedata',
        mimeType: 'image/jpeg',
        id: 'img-1',
        meta: { filename: 'photo.jpg' }
      };
      const result = await router.routeContent(artifact, 'vision-service');
      expect(result.routing).toBe('image_url');
      expect(result.contentType).toBe('image');
      expect(result.imageUrl).toBeDefined();
      expect(result.imageUrl.type).toBe('image_url');
      expect(result.imageUrl.image_url.url).toMatch(/^data:image\/jpeg;base64,/);
    });

    it('should route image to text without vision capability', async () => {
      const artifact = {
        isBinary: true,
        content: 'base64imagedata',
        mimeType: 'image/png',
        id: 'img-2',
        meta: { filename: 'screenshot.png' }
      };
      const result = await router.routeContent(artifact, 'text-only-service');
      expect(result.routing).toBe('text');
      expect(result.contentType).toBe('image');
      expect(result.content).toContain('需要专门处理');
      expect(result.content).toContain('screenshot.png');
      expect(result.content).toContain('create_role');
      expect(result.content).toContain('spawn_agent_with_task');
      expect(result.content).toContain('vision');
    });

    it('should format image_url correctly', async () => {
      const artifact = {
        isBinary: true,
        content: 'testbase64data',
        mimeType: 'image/webp',
        id: 'img-3'
      };
      const result = await router.routeContent(artifact, 'vision-service');
      expect(result.imageUrl.image_url.url).toBe('data:image/webp;base64,testbase64data');
    });

    it('should handle various image formats', async () => {
      const formats = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      for (const mimeType of formats) {
        const artifact = {
          isBinary: true,
          content: 'data',
          mimeType,
          id: 'img-test'
        };
        const result = await router.routeContent(artifact, 'vision-service');
        expect(result.routing).toBe('image_url');
        expect(result.imageUrl.image_url.url).toContain(mimeType);
      }
    });
  });

  describe('routeContent - non-image binary', () => {
    it('should route PDF to file with file capability', async () => {
      const artifact = {
        isBinary: true,
        content: 'pdfbase64data',
        mimeType: 'application/pdf',
        id: 'doc-1',
        meta: { filename: 'report.pdf' }
      };
      const result = await router.routeContent(artifact, 'file-service');
      expect(result.routing).toBe('file');
      expect(result.contentType).toBe('binary');
      expect(result.file).toBeDefined();
      expect(result.file.type).toBe('file_url');
    });

    it('should route PDF to text without file capability', async () => {
      const artifact = {
        isBinary: true,
        content: 'pdfbase64data',
        mimeType: 'application/pdf',
        id: 'doc-2',
        meta: { filename: 'report.pdf' }
      };
      const result = await router.routeContent(artifact, 'text-only-service');
      expect(result.routing).toBe('text');
      expect(result.contentType).toBe('binary');
      expect(result.content).toContain('需要专门处理');
      expect(result.content).toContain('create_role');
      expect(result.content).toContain('spawn_agent_with_task');
    });

    it('should route audio file', async () => {
      const artifact = {
        isBinary: true,
        content: 'audiodata',
        mimeType: 'audio/mp3',
        id: 'audio-1',
        meta: { filename: 'song.mp3' }
      };
      const result = await router.routeContent(artifact, 'file-service');
      expect(result.routing).toBe('file');
    });

    it('should route video file', async () => {
      const artifact = {
        isBinary: true,
        content: 'videodata',
        mimeType: 'video/mp4',
        id: 'video-1',
        meta: { filename: 'clip.mp4' }
      };
      const result = await router.routeContent(artifact, 'file-service');
      expect(result.routing).toBe('file');
    });
  });

  describe('generateTextDescription', () => {
    it('should include filename in description', () => {
      const artifact = {
        id: 'test-1',
        mimeType: 'image/jpeg',
        meta: { filename: 'photo.jpg' }
      };
      const description = router.generateTextDescription(artifact, 'image');
      expect(description).toContain('photo.jpg');
    });

    it('should include file type in description', () => {
      const artifact = {
        id: 'test-2',
        mimeType: 'application/pdf',
        meta: { filename: 'doc.pdf' }
      };
      const description = router.generateTextDescription(artifact, 'document');
      expect(description).toContain('PDF');
    });

    it('should include "not supported" message', () => {
      const artifact = {
        id: 'test-3',
        mimeType: 'image/png',
        meta: { filename: 'image.png' }
      };
      const description = router.generateTextDescription(artifact, 'image');
      expect(description).toContain('需要专门处理');
      expect(description).toContain('vision');
      expect(description).toContain('create_role');
      expect(description).toContain('spawn_agent_with_task');
      expect(description).toContain('artifact:test-3');
    });

    it('should NOT contain base64 data', () => {
      const artifact = {
        id: 'test-4',
        content: 'VGhpcyBpcyBiYXNlNjQgZGF0YQ==',
        mimeType: 'image/jpeg',
        meta: { filename: 'test.jpg' }
      };
      const description = router.generateTextDescription(artifact, 'image');
      expect(description).not.toContain('VGhpcyBpcyBiYXNlNjQgZGF0YQ==');
      expect(description).not.toMatch(/^[A-Za-z0-9+/]+=*$/);
    });

    it('should handle various file types', () => {
      const types = [
        { mimeType: 'image/jpeg', binaryType: 'image' },
        { mimeType: 'audio/mp3', binaryType: 'audio' },
        { mimeType: 'video/mp4', binaryType: 'video' },
        { mimeType: 'application/pdf', binaryType: 'document' }
      ];
      
      for (const { mimeType, binaryType } of types) {
        const artifact = { id: 'test', mimeType, meta: { filename: 'file' } };
        const description = router.generateTextDescription(artifact, binaryType);
        expect(description).toBeTruthy();
        expect(description.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Text model degradation', () => {
    it('should return description for JPEG with text-only model', async () => {
      const artifact = {
        isBinary: true,
        content: 'longbase64imagedata'.repeat(100),
        mimeType: 'image/jpeg',
        id: 'img-1',
        meta: { filename: 'photo.jpg' }
      };
      const result = await router.routeContent(artifact, 'text-only-service');
      expect(result.routing).toBe('text');
      expect(result.content).toContain('photo.jpg');
      expect(result.content).not.toContain('longbase64imagedata');
      expect(result.content.length).toBeLessThan(artifact.content.length * 0.5);
    });

    it('should return description for PNG with text-only model', async () => {
      const artifact = {
        isBinary: true,
        content: 'base64data'.repeat(50),
        mimeType: 'image/png',
        id: 'img-2',
        meta: { filename: 'screenshot.png' }
      };
      const result = await router.routeContent(artifact, 'text-only-service');
      expect(result.routing).toBe('text');
      expect(result.content).toContain('screenshot.png');
    });

    it('should return description for PDF with text-only model', async () => {
      const artifact = {
        isBinary: true,
        content: 'pdfdata'.repeat(100),
        mimeType: 'application/pdf',
        id: 'doc-1',
        meta: { filename: 'report.pdf' }
      };
      const result = await router.routeContent(artifact, 'text-only-service');
      expect(result.routing).toBe('text');
      expect(result.content).toContain('report.pdf');
      expect(result.content).toContain('PDF');
    });

    it('should include capability limitation in description', async () => {
      const artifact = {
        isBinary: true,
        content: 'data',
        mimeType: 'image/jpeg',
        id: 'test',
        meta: { filename: 'test.jpg' }
      };
      const result = await router.routeContent(artifact, 'text-only-service');
      expect(result.content).toContain('vision');
      expect(result.content).toContain('create_role');
      expect(result.content).toContain('spawn_agent_with_task');
    });

    it('should ensure description is much shorter than base64', async () => {
      const longBase64 = 'A'.repeat(10000);
      const artifact = {
        isBinary: true,
        content: longBase64,
        mimeType: 'image/jpeg',
        id: 'test',
        meta: { filename: 'large.jpg' }
      };
      const result = await router.routeContent(artifact, 'text-only-service');
      expect(result.content.length).toBeLessThan(longBase64.length * 0.1);
    });
  });

  describe('Edge cases', () => {
    it('should handle null artifact', async () => {
      const result = await router.routeContent(null, 'any-service');
      expect(result.routing).toBe('text');
      expect(result.content).toContain('错误');
    });

    it('should handle undefined artifact', async () => {
      const result = await router.routeContent(undefined, 'any-service');
      expect(result.routing).toBe('text');
      expect(result.content).toContain('错误');
    });

    it('should handle null serviceId', async () => {
      const artifact = {
        isBinary: true,
        content: 'data',
        mimeType: 'image/jpeg',
        id: 'test'
      };
      const result = await router.routeContent(artifact, null);
      expect(result.routing).toBe('text');
    });

    it('should handle empty MIME type', () => {
      const artifact = { mimeType: '', meta: { filename: 'file.jpg' } };
      const result = router.detectBinaryType(artifact);
      expect(result.type).toBe('image');
    });

    it('should handle MIME type with parameters', () => {
      const artifact = { mimeType: 'image/jpeg; charset=utf-8' };
      const result = router.detectBinaryType(artifact);
      // Should still detect as image despite parameters
      expect(result.type).toBe('image');
    });

    it('should handle case-insensitive MIME types', () => {
      const artifact = { mimeType: 'IMAGE/JPEG' };
      const result = router.detectBinaryType(artifact);
      expect(result.type).toBe('image');
    });
  });

  describe('formatImageUrl', () => {
    it('should format image URL correctly', () => {
      const result = router.formatImageUrl('testdata', 'image/png');
      expect(result.type).toBe('image_url');
      expect(result.image_url.url).toBe('data:image/png;base64,testdata');
    });

    it('should handle null MIME type', () => {
      const result = router.formatImageUrl('testdata', null);
      expect(result.image_url.url).toContain('image/jpeg');
    });

    it('should normalize MIME type', () => {
      const result = router.formatImageUrl('data', 'IMAGE/PNG');
      expect(result.image_url.url).toContain('image/png');
    });
  });
});
