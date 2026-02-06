/**
 * Content Type Utilities 测试
 * 
 * 测试 MIME 类型相关的工具函数
 */

import { describe, it, expect } from 'vitest';
import { 
  sanitizeMimeType,
  extractExtension,
  detectBinaryType,
  getFriendlyTypeName,
  MIME_TYPE_MAPPINGS
} from '../../src/platform/utils/content/content_type_utils.js';

describe('sanitizeMimeType', () => {
  it('应该正确处理标准的 MIME 类型', () => {
    expect(sanitizeMimeType('text/plain')).toBe('text/plain');
    expect(sanitizeMimeType('application/json')).toBe('application/json');
    expect(sanitizeMimeType('image/png')).toBe('image/png');
    expect(sanitizeMimeType('text/javascript')).toBe('text/javascript');
  });

  it('应该去除两侧的空格', () => {
    expect(sanitizeMimeType('  text/plain  ')).toBe('text/plain');
    expect(sanitizeMimeType(' text/plain')).toBe('text/plain');
    expect(sanitizeMimeType('text/plain ')).toBe('text/plain');
    expect(sanitizeMimeType('  application/json  ')).toBe('application/json');
  });

  it('应该去除两侧的单引号', () => {
    expect(sanitizeMimeType("'text/plain'")).toBe('text/plain');
    expect(sanitizeMimeType("'application/json'")).toBe('application/json');
    expect(sanitizeMimeType("'image/png'")).toBe('image/png');
  });

  it('应该去除两侧的双引号', () => {
    expect(sanitizeMimeType('"text/plain"')).toBe('text/plain');
    expect(sanitizeMimeType('"application/json"')).toBe('application/json');
    expect(sanitizeMimeType('"image/png"')).toBe('image/png');
  });

  it('应该同时去除空格和引号', () => {
    expect(sanitizeMimeType('  "text/plain"  ')).toBe('text/plain');
    expect(sanitizeMimeType(" 'application/json' ")).toBe('application/json');
    expect(sanitizeMimeType('" image/png "')).toBe('image/png');
  });

  it('应该处理混合引号情况', () => {
    expect(sanitizeMimeType("'text/plain\"")).toBe('text/plain');
    expect(sanitizeMimeType('"application/json\'')).toBe('application/json');
  });

  it('应该处理包含额外字符的情况', () => {
    // 提取中间符合 MIME 格式的部分
    expect(sanitizeMimeType('"text/plain", some extra')).toBe('text/plain');
    expect(sanitizeMimeType('prefix application/json suffix')).toBe('application/json');
  });

  it('应该转换为小写', () => {
    expect(sanitizeMimeType('TEXT/PLAIN')).toBe('text/plain');
    expect(sanitizeMimeType('Application/JSON')).toBe('application/json');
    expect(sanitizeMimeType('  IMAGE/PNG  ')).toBe('image/png');
  });

  it('应该处理带 + 号的 MIME 类型', () => {
    expect(sanitizeMimeType('application/xhtml+xml')).toBe('application/xhtml+xml');
    expect(sanitizeMimeType('image/svg+xml')).toBe('image/svg+xml');
    expect(sanitizeMimeType('  "application/xhtml+xml"  ')).toBe('application/xhtml+xml');
  });

  it('应该处理带 - 号的 MIME 类型', () => {
    expect(sanitizeMimeType('application/x-www-form-urlencoded')).toBe('application/x-www-form-urlencoded');
    expect(sanitizeMimeType('audio/x-wav')).toBe('audio/x-wav');
    expect(sanitizeMimeType("'audio/x-wav'")).toBe('audio/x-wav');
  });

  it('应该处理带 . 号的 MIME 类型', () => {
    expect(sanitizeMimeType('application/vnd.ms-excel')).toBe('application/vnd.ms-excel');
    expect(sanitizeMimeType('  "application/vnd.ms-excel"  ')).toBe('application/vnd.ms-excel');
  });

  it('对于无效输入应该返回空字符串', () => {
    expect(sanitizeMimeType('')).toBe('');
    expect(sanitizeMimeType(null)).toBe('');
    expect(sanitizeMimeType(undefined)).toBe('');
    expect(sanitizeMimeType(123)).toBe('');
    expect(sanitizeMimeType({})).toBe('');
  });

  it('对于不符合 MIME 格式的字符串应该返回空字符串', () => {
    expect(sanitizeMimeType('not-a-mime-type')).toBe('');
    expect(sanitizeMimeType('/plain')).toBe('');
    expect(sanitizeMimeType('text/')).toBe('');
    // 注意：'plain/text/extra' 包含有效的 MIME 类型 'plain/text'，会被提取
    expect(sanitizeMimeType('plain/text/extra')).toBe('plain/text');
  });
});

describe('extractExtension', () => {
  it('应该正确提取文件扩展名', () => {
    expect(extractExtension('file.txt')).toBe('.txt');
    expect(extractExtension('file.js')).toBe('.js');
    expect(extractExtension('file.JSON')).toBe('.json');
    expect(extractExtension('path/to/file.png')).toBe('.png');
  });

  it('对于没有扩展名的文件应该返回 null', () => {
    expect(extractExtension('file')).toBe(null);
    expect(extractExtension('path/to/file')).toBe(null);
  });

  it('对于隐藏文件应该正确处理', () => {
    expect(extractExtension('.gitignore')).toBe(null);
    expect(extractExtension('.bashrc')).toBe(null);
  });
});

describe('detectBinaryType', () => {
  it('应该正确检测图片类型', () => {
    const result = detectBinaryType({ mimeType: 'image/png', filename: 'test.png' });
    expect(result.type).toBe('image');
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it('应该正确检测音频类型', () => {
    const result = detectBinaryType({ mimeType: 'audio/mp3', filename: 'test.mp3' });
    expect(result.type).toBe('audio');
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it('应该正确检测视频类型', () => {
    const result = detectBinaryType({ mimeType: 'video/mp4', filename: 'test.mp4' });
    expect(result.type).toBe('video');
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it('应该正确检测文档类型', () => {
    const result = detectBinaryType({ mimeType: 'application/pdf', filename: 'test.pdf' });
    expect(result.type).toBe('document');
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it('对于未知类型应该返回 other', () => {
    const result = detectBinaryType({ mimeType: 'application/octet-stream', filename: 'test.bin' });
    expect(result.type).toBe('other');
  });
});

describe('getFriendlyTypeName', () => {
  it('应该返回友好的类型名称', () => {
    expect(getFriendlyTypeName('image/png')).toBe('PNG Image');
    expect(getFriendlyTypeName('image/jpeg')).toBe('JPEG Image');
    expect(getFriendlyTypeName('application/pdf')).toBe('PDF Document');
    expect(getFriendlyTypeName('audio/mpeg')).toBe('MP3 Audio');
  });

  it('对于未知类型应该返回通用名称', () => {
    expect(getFriendlyTypeName('text/plain')).toBe('Text File');
    expect(getFriendlyTypeName('application/octet-stream')).toBe('Binary File');
  });

  it('对于无效输入应该返回 Binary File', () => {
    expect(getFriendlyTypeName(null)).toBe('Binary File');
    expect(getFriendlyTypeName('')).toBe('Binary File');
  });
});
