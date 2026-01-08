/**
 * Chrome 选择器清理属性测试
 * Feature: chrome-selector-sanitization
 * 
 * 使用 fast-check 进行属性测试，验证 _sanitizeSelector 方法的正确性
 */

import { describe, it, expect, beforeEach } from "vitest";
import * as fc from "fast-check";
import { PageActions } from "../../modules/chrome/page_actions.js";

describe("Feature: chrome-selector-sanitization", () => {
  let pageActions;
  const mockTabManager = { getPage: () => null };
  const mockLog = { info: () => {}, error: () => {}, debug: () => {}, warn: () => {} };

  beforeEach(() => {
    pageActions = new PageActions({ log: mockLog, tabManager: mockTabManager });
  });

  // 生成有效的 CSS 选择器字符
  const selectorCharArb = fc.constantFrom(
    'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
    'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
    'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
    '#', '.', '-', '_', '[', ']', '=', '>', '+', '~', ':', '*'
  );

  // 生成有效的 CSS 选择器（不以引号开头结尾）
  const validSelectorArb = fc.array(selectorCharArb, { minLength: 1, maxLength: 30 })
    .map(chars => chars.join(''))
    .filter(s => !s.startsWith('"') && !s.startsWith("'") && s.trim().length > 0);

  // 生成干净的选择器（无外层引号和空白）
  const cleanSelectorArb = fc.array(selectorCharArb, { minLength: 1, maxLength: 20 })
    .map(chars => chars.join(''))
    .filter(s => 
      !s.startsWith('"') && !s.startsWith("'") && 
      !s.endsWith('"') && !s.endsWith("'") &&
      s === s.trim() && s.length > 0
    );

  // ==================== Property 1: Outer Quote Removal ====================
  // **Validates: Requirements 1.1, 1.2, 1.3**
  describe("Property 1: Outer Quote Removal", () => {

    it("should remove outer double quotes from any selector", () => {
      fc.assert(
        fc.property(validSelectorArb, (selector) => {
          const quoted = `"${selector}"`;
          const result = pageActions._sanitizeSelector(quoted);
          
          expect(result.cleaned).toBe(selector.trim());
          expect(result.modified).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it("should remove outer single quotes from any selector", () => {
      fc.assert(
        fc.property(validSelectorArb, (selector) => {
          const quoted = `'${selector}'`;
          const result = pageActions._sanitizeSelector(quoted);
          
          expect(result.cleaned).toBe(selector.trim());
          expect(result.modified).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it("should trim leading and trailing whitespace from any selector", () => {
      const whitespaceArb = fc.array(fc.constantFrom(' ', '\t'), { minLength: 1, maxLength: 3 })
        .map(chars => chars.join(''));
      
      fc.assert(
        fc.property(validSelectorArb, whitespaceArb, whitespaceArb, (selector, leadingWs, trailingWs) => {
          const padded = `${leadingWs}${selector}${trailingWs}`;
          const result = pageActions._sanitizeSelector(padded);
          
          expect(result.cleaned).toBe(selector.trim());
          expect(result.modified).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });

  // ==================== Property 2: Clean Selector Idempotence ====================
  // **Validates: Requirements 1.4**
  describe("Property 2: Clean Selector Idempotence", () => {

    it("should return clean selectors unchanged", () => {
      fc.assert(
        fc.property(cleanSelectorArb, (selector) => {
          const result = pageActions._sanitizeSelector(selector);
          
          expect(result.cleaned).toBe(selector);
          expect(result.modified).toBe(false);
          expect(result.original).toBe(selector);
        }),
        { numRuns: 100 }
      );
    });

    it("should be idempotent - sanitizing twice gives same result", () => {
      const anySelectorArb = fc.oneof(
        cleanSelectorArb,
        cleanSelectorArb.map(s => `"${s}"`),
        cleanSelectorArb.map(s => `'${s}'`),
        cleanSelectorArb.map(s => `  ${s}  `)
      );

      fc.assert(
        fc.property(anySelectorArb, (selector) => {
          const first = pageActions._sanitizeSelector(selector);
          const second = pageActions._sanitizeSelector(first.cleaned);
          
          expect(second.cleaned).toBe(first.cleaned);
          expect(second.modified).toBe(false);
        }),
        { numRuns: 100 }
      );
    });
  });

  // ==================== Property 3: Internal Quote Preservation ====================
  // **Validates: Requirements 1.5**
  describe("Property 3: Internal Quote Preservation", () => {
    
    // 生成属性名
    const attrNameCharArb = fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', '-');
    const attrNameArb = fc.array(attrNameCharArb, { minLength: 1, maxLength: 10 })
      .map(chars => chars.join(''))
      .filter(s => /^[a-z]/.test(s));
    
    // 生成属性值
    const attrValueCharArb = fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', '0', '1', '2', '3', '-', '_');
    const attrValueArb = fc.array(attrValueCharArb, { minLength: 1, maxLength: 10 })
      .map(chars => chars.join(''));

    it("should preserve internal double quotes in attribute selectors", () => {
      fc.assert(
        fc.property(attrNameArb, attrValueArb, (attrName, attrValue) => {
          const selector = `[${attrName}="${attrValue}"]`;
          const result = pageActions._sanitizeSelector(selector);
          
          expect(result.cleaned).toBe(selector);
          expect(result.modified).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it("should preserve internal single quotes in attribute selectors", () => {
      fc.assert(
        fc.property(attrNameArb, attrValueArb, (attrName, attrValue) => {
          const selector = `[${attrName}='${attrValue}']`;
          const result = pageActions._sanitizeSelector(selector);
          
          expect(result.cleaned).toBe(selector);
          expect(result.modified).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it("should remove outer quotes while preserving internal quotes", () => {
      fc.assert(
        fc.property(attrNameArb, attrValueArb, (attrName, attrValue) => {
          const innerSelector = `[${attrName}="${attrValue}"]`;
          const outerQuoted = `"${innerSelector}"`;
          const result = pageActions._sanitizeSelector(outerQuoted);
          
          expect(result.cleaned).toBe(innerSelector);
          expect(result.modified).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });

  // ==================== Edge Cases ====================
  describe("Edge Cases", () => {
    it("should handle empty string", () => {
      const result = pageActions._sanitizeSelector("");
      expect(result.cleaned).toBe("");
      expect(result.modified).toBe(false);
    });

    it("should handle null", () => {
      const result = pageActions._sanitizeSelector(null);
      expect(result.cleaned).toBe(null);
      expect(result.modified).toBe(false);
    });

    it("should handle undefined", () => {
      const result = pageActions._sanitizeSelector(undefined);
      expect(result.cleaned).toBe(undefined);
      expect(result.modified).toBe(false);
    });

    it("should handle only quotes", () => {
      const result = pageActions._sanitizeSelector('""');
      expect(result.cleaned).toBe("");
      expect(result.modified).toBe(true);
    });

    it("should only remove outermost quotes (nested quotes)", () => {
      const result = pageActions._sanitizeSelector(`"'#id'"`);
      expect(result.cleaned).toBe("'#id'");
      expect(result.modified).toBe(true);
    });

    it("should handle mismatched quotes (no removal)", () => {
      const result = pageActions._sanitizeSelector(`"#id'`);
      expect(result.cleaned).toBe(`"#id'`);
      expect(result.modified).toBe(false);
    });
  });
});
