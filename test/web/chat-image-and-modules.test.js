/**
 * 聊天图片显示和模块面板属性测试
 * 功能: chat-image-and-chrome-panel
 */

import { describe, test, expect } from 'bun:test';
import * as fc from 'fast-check';

// ============================================================================
// 测试辅助函数（模拟实际组件逻辑）
// ============================================================================

/**
 * 从消息中提取图片数组
 * @param {object} message - 消息对象
 * @returns {Array} 图片路径数组
 */
function extractImages(message) {
  let images = [];
  
  if (message.payload) {
    if (Array.isArray(message.payload.images)) {
      images = message.payload.images;
    } else if (message.payload.result && Array.isArray(message.payload.result.images)) {
      images = message.payload.result.images;
    }
  }
  
  return images;
}

/**
 * 将 kebab-case 或 snake_case 转换为 PascalCase
 * @param {string} str - 输入字符串
 * @returns {string} PascalCase 格式的字符串
 */
function toPascalCase(str) {
  if (!str) return '';
  return str
    .split(/[-_]/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

/**
 * 生成模块面板的标准命名
 * @param {string} moduleName - 模块名称
 * @returns {string} 标准面板名称
 */
function getModulePanelName(moduleName) {
  return `ModulePanel_${toPascalCase(moduleName)}`;
}

/**
 * 模拟渲染图片缩略图
 * @param {object} message - 消息对象
 * @returns {object} 渲染结果
 */
function renderMessageImages(message) {
  const images = extractImages(message);
  
  return {
    images,
    hasImages: images.length > 0,
    thumbnailCount: images.length,
  };
}

// ============================================================================
// 数据生成器
// ============================================================================

// 图片路径生成器
const imagePathArb = fc.stringMatching(/^[a-zA-Z0-9_-]+\.(png|jpg|jpeg|gif)$/);

// 图片数组生成器
const imagesArrayArb = fc.array(imagePathArb, { minLength: 0, maxLength: 5 });

// 带图片的消息 payload 生成器
const payloadWithImagesArb = fc.oneof(
  // 直接包含 images 数组
  fc.record({
    text: fc.string({ minLength: 1, maxLength: 100 }),
    images: imagesArrayArb,
  }),
  // result 中包含 images 数组
  fc.record({
    toolName: fc.string({ minLength: 1, maxLength: 50 }),
    result: fc.record({
      success: fc.boolean(),
      images: imagesArrayArb,
    }),
  }),
  // 不包含图片
  fc.record({
    text: fc.string({ minLength: 1, maxLength: 100 }),
  })
);

// 消息生成器
const messageArbitrary = fc.record({
  id: fc.uuid(),
  from: fc.uuid(),
  to: fc.uuid(),
  type: fc.oneof(fc.constant('message'), fc.constant('tool_call')),
  payload: payloadWithImagesArb,
  createdAt: fc.date().map(d => d.toISOString()),
});

// 模块名称生成器（kebab-case 和 snake_case）
const moduleNameArb = fc.oneof(
  fc.stringMatching(/^[a-z]+(-[a-z]+)*$/), // kebab-case
  fc.stringMatching(/^[a-z]+(_[a-z]+)*$/), // snake_case
  fc.constant('chrome'),
  fc.constant('file-manager'),
  fc.constant('api_client'),
);

// 浏览器实例生成器
const browserArb = fc.record({
  id: fc.uuid(),
  status: fc.oneof(fc.constant('connected'), fc.constant('disconnected')),
});

// ============================================================================
// 属性测试
// ============================================================================

describe('功能: chat-image-and-chrome-panel, 属性 1: 图片字段一致性', () => {
  test('extractImages 应始终返回数组', () => {
    fc.assert(
      fc.property(
        messageArbitrary,
        (message) => {
          const images = extractImages(message);
          expect(Array.isArray(images)).toBe(true);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('payload.images 存在时应正确提取', () => {
    fc.assert(
      fc.property(
        imagesArrayArb,
        (images) => {
          const message = {
            payload: { images, text: 'test' }
          };
          const extracted = extractImages(message);
          expect(extracted).toEqual(images);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('payload.result.images 存在时应正确提取', () => {
    fc.assert(
      fc.property(
        imagesArrayArb,
        (images) => {
          const message = {
            payload: {
              toolName: 'screenshot',
              result: { success: true, images }
            }
          };
          const extracted = extractImages(message);
          expect(extracted).toEqual(images);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('无图片时应返回空数组', () => {
    const messagesWithoutImages = [
      { payload: { text: 'hello' } },
      { payload: { result: { success: true } } },
      { payload: null },
      {},
    ];
    
    for (const msg of messagesWithoutImages) {
      const images = extractImages(msg);
      expect(images).toEqual([]);
    }
  });
});

describe('功能: chat-image-and-chrome-panel, 属性 2: 图片缩略图渲染完整性', () => {
  test('渲染结果的缩略图数量应等于图片数组长度', () => {
    fc.assert(
      fc.property(
        messageArbitrary,
        (message) => {
          const result = renderMessageImages(message);
          const expectedImages = extractImages(message);
          
          expect(result.thumbnailCount).toBe(expectedImages.length);
          expect(result.hasImages).toBe(expectedImages.length > 0);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('所有图片路径应被包含在渲染结果中', () => {
    fc.assert(
      fc.property(
        imagesArrayArb.filter(arr => arr.length > 0),
        (images) => {
          const message = { payload: { images } };
          const result = renderMessageImages(message);
          
          for (const img of images) {
            expect(result.images).toContain(img);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('功能: chat-image-and-chrome-panel, 属性 3: 模块面板通用初始化', () => {
  test('toPascalCase 应正确转换 kebab-case', () => {
    const cases = [
      ['chrome', 'Chrome'],
      ['file-manager', 'FileManager'],
      ['api-client', 'ApiClient'],
      ['my-long-module-name', 'MyLongModuleName'],
    ];
    
    for (const [input, expected] of cases) {
      expect(toPascalCase(input)).toBe(expected);
    }
  });

  test('toPascalCase 应正确转换 snake_case', () => {
    const cases = [
      ['chrome', 'Chrome'],
      ['file_manager', 'FileManager'],
      ['api_client', 'ApiClient'],
      ['my_long_module_name', 'MyLongModuleName'],
    ];
    
    for (const [input, expected] of cases) {
      expect(toPascalCase(input)).toBe(expected);
    }
  });

  test('toPascalCase 应处理空字符串', () => {
    expect(toPascalCase('')).toBe('');
    expect(toPascalCase(null)).toBe('');
    expect(toPascalCase(undefined)).toBe('');
  });

  test('getModulePanelName 应生成正确的面板名称', () => {
    fc.assert(
      fc.property(
        moduleNameArb,
        (moduleName) => {
          const panelName = getModulePanelName(moduleName);
          
          // 应以 ModulePanel_ 开头
          expect(panelName.startsWith('ModulePanel_')).toBe(true);
          
          // 下划线后应为 PascalCase
          const suffix = panelName.replace('ModulePanel_', '');
          expect(suffix.charAt(0)).toBe(suffix.charAt(0).toUpperCase());
          
          // 不应包含连字符或下划线（除了前缀）
          expect(suffix.includes('-')).toBe(false);
          expect(suffix.includes('_')).toBe(false);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('chrome 模块应生成 ModulePanel_Chrome', () => {
    expect(getModulePanelName('chrome')).toBe('ModulePanel_Chrome');
  });
});

describe('功能: chat-image-and-chrome-panel, 属性 4: 浏览器列表渲染', () => {
  /**
   * 模拟渲染浏览器列表
   * @param {Array} browsers - 浏览器数组
   * @param {string|null} selectedId - 选中的浏览器 ID
   * @returns {object} 渲染结果
   */
  function renderBrowserList(browsers, selectedId) {
    if (!Array.isArray(browsers)) {
      return { items: [], selectedCount: 0, hasEmpty: true };
    }
    
    if (browsers.length === 0) {
      return { items: [], selectedCount: 0, hasEmpty: true };
    }
    
    const items = browsers.map(browser => ({
      id: browser.id,
      isSelected: browser.id === selectedId,
      status: browser.status,
    }));
    
    const selectedCount = items.filter(item => item.isSelected).length;
    
    return { items, selectedCount, hasEmpty: false };
  }

  test('渲染结果应包含所有浏览器', () => {
    fc.assert(
      fc.property(
        fc.array(browserArb, { minLength: 1, maxLength: 10 }),
        (browsers) => {
          const result = renderBrowserList(browsers, null);
          
          expect(result.items.length).toBe(browsers.length);
          expect(result.hasEmpty).toBe(false);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('选中状态应正确标记', () => {
    fc.assert(
      fc.property(
        fc.array(browserArb, { minLength: 1, maxLength: 10 }),
        fc.nat(),
        (browsers, indexSeed) => {
          const selectedIndex = indexSeed % browsers.length;
          const selectedId = browsers[selectedIndex].id;
          
          const result = renderBrowserList(browsers, selectedId);
          
          // 应该只有一个选中项
          expect(result.selectedCount).toBe(1);
          
          // 选中项的 ID 应匹配
          const selectedItem = result.items.find(item => item.isSelected);
          expect(selectedItem.id).toBe(selectedId);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('空数组应显示空状态', () => {
    const result = renderBrowserList([], null);
    expect(result.hasEmpty).toBe(true);
    expect(result.items.length).toBe(0);
  });

  test('无效输入应安全处理', () => {
    expect(renderBrowserList(null, null).hasEmpty).toBe(true);
    expect(renderBrowserList(undefined, null).hasEmpty).toBe(true);
    expect(renderBrowserList('invalid', null).hasEmpty).toBe(true);
  });
});
