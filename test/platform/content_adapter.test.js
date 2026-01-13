import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import { ContentAdapter, formatFileSize, CONTENT_TYPE_TO_CAPABILITY, CONTENT_TYPE_LABELS } from "../../src/platform/content_adapter.js";

// 生成有效的附件信息
const validAttachmentArb = fc.record({
  type: fc.constantFrom("image", "audio", "file"),
  artifactRef: fc.string({ minLength: 1, maxLength: 100 }).map(s => `artifact:${s}`),
  filename: fc.option(fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0), { nil: undefined }),
  size: fc.option(fc.integer({ min: 0, max: 1024 * 1024 * 1024 }), { nil: undefined }),
  mimeType: fc.option(fc.constantFrom("image/png", "image/jpeg", "audio/mp3", "application/pdf", "text/plain"), { nil: undefined })
});

describe("ContentAdapter", () => {
  describe("基础功能测试", () => {
    test("创建实例不抛出异常", () => {
      const adapter = new ContentAdapter();
      expect(adapter).toBeDefined();
    });

    test("adaptToText 返回正确的结构", () => {
      const adapter = new ContentAdapter();
      const result = adapter.adaptToText({
        type: "image",
        artifactRef: "artifact:test-123",
        filename: "test.png",
        size: 1024,
        mimeType: "image/png"
      });
      
      expect(result).toHaveProperty("text");
      expect(result).toHaveProperty("structuredInfo");
      expect(typeof result.text).toBe("string");
      expect(typeof result.structuredInfo).toBe("object");
    });

    test("adaptMultiple 处理多个附件", () => {
      const adapter = new ContentAdapter();
      const attachments = [
        { type: "image", artifactRef: "artifact:img-1", filename: "a.png" },
        { type: "audio", artifactRef: "artifact:audio-1", filename: "b.mp3" },
        { type: "file", artifactRef: "artifact:file-1", filename: "c.pdf" }
      ];
      
      const results = adapter.adaptMultiple(attachments);
      expect(results.length).toBe(3);
      results.forEach(r => {
        expect(r).toHaveProperty("text");
        expect(r).toHaveProperty("structuredInfo");
      });
    });

    test("adaptMultiple 处理空数组", () => {
      const adapter = new ContentAdapter();
      const results = adapter.adaptMultiple([]);
      expect(results).toEqual([]);
    });

    test("adaptMultiple 处理非数组输入", () => {
      const adapter = new ContentAdapter();
      expect(adapter.adaptMultiple(null)).toEqual([]);
      expect(adapter.adaptMultiple(undefined)).toEqual([]);
    });
  });

  describe("formatFileSize 辅助函数", () => {
    test("格式化字节", () => {
      expect(formatFileSize(0)).toBe("0 B");
      expect(formatFileSize(100)).toBe("100 B");
      expect(formatFileSize(1023)).toBe("1023 B");
    });

    test("格式化 KB", () => {
      expect(formatFileSize(1024)).toBe("1.0 KB");
      expect(formatFileSize(1536)).toBe("1.5 KB");
      expect(formatFileSize(1024 * 100)).toBe("100.0 KB");
    });

    test("格式化 MB", () => {
      expect(formatFileSize(1024 * 1024)).toBe("1.0 MB");
      expect(formatFileSize(1024 * 1024 * 1.5)).toBe("1.5 MB");
    });

    test("格式化 GB", () => {
      expect(formatFileSize(1024 * 1024 * 1024)).toBe("1.0 GB");
      expect(formatFileSize(1024 * 1024 * 1024 * 2.5)).toBe("2.5 GB");
    });

    test("处理无效输入", () => {
      expect(formatFileSize(undefined)).toBe("未知");
      expect(formatFileSize(null)).toBe("未知");
      expect(formatFileSize(NaN)).toBe("未知");
    });
  });

  /**
   * Feature: model-capability-routing, Property 4: Content Adapter Output Completeness
   * *For any* content conversion performed by ContentAdapter, the output text SHALL contain:
   * - The artifact reference ID
   * - The content type (image/audio/file)
   * - The filename (if available in the original attachment)
   * - The file size (if available)
   * - A suggestion to forward to capable agents
   * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
   */
  describe("Property 4: Content Adapter Output Completeness", () => {
    test("输出文本包含 artifact reference ID", () => {
      fc.assert(
        fc.property(
          validAttachmentArb,
          (attachment) => {
            const adapter = new ContentAdapter();
            const result = adapter.adaptToText(attachment);
            
            // 文本中应该包含 artifactRef
            expect(result.text).toContain(attachment.artifactRef);
            // structuredInfo 中也应该包含
            expect(result.structuredInfo.artifactRef).toBe(attachment.artifactRef);
          }
        ),
        { numRuns: 100 }
      );
    });

    test("输出文本包含内容类型", () => {
      fc.assert(
        fc.property(
          validAttachmentArb,
          (attachment) => {
            const adapter = new ContentAdapter();
            const result = adapter.adaptToText(attachment);
            
            // 文本中应该包含类型标签
            const typeLabel = CONTENT_TYPE_LABELS[attachment.type] || "文件";
            expect(result.text).toContain(typeLabel);
            // structuredInfo 中应该包含原始类型
            expect(result.structuredInfo.contentType).toBe(attachment.type);
          }
        ),
        { numRuns: 100 }
      );
    });

    test("输出文本包含文件名（如果提供）", () => {
      fc.assert(
        fc.property(
          validAttachmentArb,
          (attachment) => {
            const adapter = new ContentAdapter();
            const result = adapter.adaptToText(attachment);
            
            if (attachment.filename) {
              // 如果提供了文件名，文本中应该包含
              expect(result.text).toContain(attachment.filename);
              expect(result.structuredInfo.filename).toBe(attachment.filename);
            } else {
              // 如果没有提供，structuredInfo 中应该是 null
              expect(result.structuredInfo.filename).toBeNull();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test("输出文本包含文件大小（如果提供）", () => {
      fc.assert(
        fc.property(
          validAttachmentArb,
          (attachment) => {
            const adapter = new ContentAdapter();
            const result = adapter.adaptToText(attachment);
            
            if (attachment.size !== undefined) {
              // 如果提供了大小（包括 0），文本中应该包含格式化后的大小
              expect(result.text).toContain("文件大小:");
              expect(result.structuredInfo.size).toBe(attachment.size);
            } else {
              // 如果没有提供，structuredInfo 中应该是 null
              expect(result.structuredInfo.size).toBeNull();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test("输出文本包含转发建议", () => {
      fc.assert(
        fc.property(
          validAttachmentArb,
          (attachment) => {
            const adapter = new ContentAdapter();
            const result = adapter.adaptToText(attachment);
            
            // 文本中应该包含转发建议
            expect(result.text).toContain("当前模型不支持直接处理此类型内容");
            expect(result.text).toContain("send_message");
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: model-capability-routing, Property 5: Structured Output Format
   * *For any* content conversion, the ContentAdapter output SHALL be parseable as structured data,
   * containing all required fields in a consistent format that can be programmatically extracted.
   * **Validates: Requirements 3.6**
   */
  describe("Property 5: Structured Output Format", () => {
    test("structuredInfo 包含所有必需字段", () => {
      fc.assert(
        fc.property(
          validAttachmentArb,
          (attachment) => {
            const adapter = new ContentAdapter();
            const result = adapter.adaptToText(attachment);
            
            // 验证 structuredInfo 包含所有必需字段
            expect(result.structuredInfo).toHaveProperty("contentType");
            expect(result.structuredInfo).toHaveProperty("artifactRef");
            expect(result.structuredInfo).toHaveProperty("filename");
            expect(result.structuredInfo).toHaveProperty("size");
            expect(result.structuredInfo).toHaveProperty("mimeType");
            expect(result.structuredInfo).toHaveProperty("suggestedAgents");
          }
        ),
        { numRuns: 100 }
      );
    });

    test("structuredInfo 字段类型正确", () => {
      fc.assert(
        fc.property(
          validAttachmentArb,
          (attachment) => {
            const adapter = new ContentAdapter();
            const result = adapter.adaptToText(attachment);
            const info = result.structuredInfo;
            
            // contentType 应该是字符串
            expect(typeof info.contentType).toBe("string");
            
            // artifactRef 应该是字符串
            expect(typeof info.artifactRef).toBe("string");
            
            // filename 应该是字符串或 null
            expect(info.filename === null || typeof info.filename === "string").toBe(true);
            
            // size 应该是数字或 null
            expect(info.size === null || typeof info.size === "number").toBe(true);
            
            // mimeType 应该是字符串或 null
            expect(info.mimeType === null || typeof info.mimeType === "string").toBe(true);
            
            // suggestedAgents 应该是数组或 null
            expect(info.suggestedAgents === null || Array.isArray(info.suggestedAgents)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    test("structuredInfo 可以被 JSON 序列化和反序列化", () => {
      fc.assert(
        fc.property(
          validAttachmentArb,
          (attachment) => {
            const adapter = new ContentAdapter();
            const result = adapter.adaptToText(attachment);
            
            // 应该可以序列化为 JSON
            const jsonStr = JSON.stringify(result.structuredInfo);
            expect(typeof jsonStr).toBe("string");
            
            // 应该可以反序列化回来
            const parsed = JSON.parse(jsonStr);
            expect(parsed).toEqual(result.structuredInfo);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("findCapableAgents 方法", () => {
    test("没有 agentRegistry 时返回空数组", () => {
      const adapter = new ContentAdapter();
      expect(adapter.findCapableAgents("vision")).toEqual([]);
    });

    test("使用 getAgentsByCapability 方法", () => {
      const mockAgentRegistry = {
        getAgentsByCapability: (capType) => {
          if (capType === "vision") return ["agent-1", "agent-2"];
          return [];
        }
      };
      
      const adapter = new ContentAdapter({ agentRegistry: mockAgentRegistry });
      expect(adapter.findCapableAgents("vision")).toEqual(["agent-1", "agent-2"]);
      expect(adapter.findCapableAgents("audio")).toEqual([]);
    });

    test("使用 getAgents 方法遍历查找", () => {
      const mockServiceRegistry = {
        hasCapability: (serviceId, capType, direction) => {
          if (serviceId === "vision-service" && capType === "vision") return true;
          return false;
        }
      };
      
      const mockAgentRegistry = {
        getAgents: () => [
          { id: "agent-1", serviceId: "vision-service" },
          { id: "agent-2", serviceId: "text-service" }
        ]
      };
      
      const adapter = new ContentAdapter({
        serviceRegistry: mockServiceRegistry,
        agentRegistry: mockAgentRegistry
      });
      
      expect(adapter.findCapableAgents("vision")).toEqual(["agent-1"]);
    });
  });
});
