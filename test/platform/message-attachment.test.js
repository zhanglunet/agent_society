/**
 * 消息附件属性测试
 * Property 6: Message Attachment References Integrity
 * 
 * Requirements: 5.2, 5.3
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import fc from "fast-check";
import { HTTPServer } from "../../src/platform/http_server.js";

describe("Message Attachment Properties", () => {
  let server;
  let mockSociety;
  let sentMessages;

  beforeEach(() => {
    sentMessages = [];
    mockSociety = {
      sendTextToAgent: mock((agentId, payload, options) => {
        sentMessages.push({ agentId, payload, options });
        return { taskId: "test-task-id", to: agentId };
      }),
      // Mock required methods
      onUserMessage: mock(() => {}),
      onAllMessages: mock(() => {}),
      runtime: null
    };
    
    server = new HTTPServer({ port: 0 });
    server.setSociety(mockSociety);
  });

  afterEach(async () => {
    if (server.isRunning()) {
      await server.stop();
    }
  });

  /**
   * 创建模拟请求对象
   */
  function createMockRequest(body) {
    const bodyStr = JSON.stringify(body);
    let dataCallback = null;
    let endCallback = null;
    
    return {
      method: "POST",
      url: "/api/send",
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(bodyStr).toString()
      },
      on: (event, callback) => {
        if (event === "data") {
          dataCallback = callback;
        } else if (event === "end") {
          endCallback = callback;
        }
      },
      // 触发数据事件
      _emit: () => {
        if (dataCallback) dataCallback(Buffer.from(bodyStr));
        if (endCallback) endCallback();
      }
    };
  }

  /**
   * 创建模拟响应对象
   */
  function createMockResponse() {
    let statusCode = 200;
    let responseBody = "";
    const headers = {};
    
    return {
      setHeader: (name, value) => { headers[name] = value; },
      writeHead: (code) => { statusCode = code; },
      end: (body) => { responseBody = body; },
      getStatusCode: () => statusCode,
      getBody: () => responseBody,
      getHeaders: () => headers
    };
  }

  describe("Property 6: Message Attachment References Integrity", () => {
    it("should preserve attachment references in message payload", async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成随机附件数组
          fc.array(
            fc.record({
              type: fc.constantFrom("image", "file"),
              artifactRef: fc.string({ minLength: 1, maxLength: 50 }).map(s => `artifact:${s.replace(/[^a-zA-Z0-9-]/g, '')}`),
              filename: fc.string({ minLength: 1, maxLength: 100 }).map(s => s.replace(/[^a-zA-Z0-9._-]/g, '') || "file.txt")
            }),
            { minLength: 1, maxLength: 5 }
          ),
          fc.string({ minLength: 1, maxLength: 200 }),
          async (attachments, messageText) => {
            sentMessages = [];
            
            const body = {
              to: "test-agent",
              message: messageText,
              attachments: attachments
            };
            
            const req = createMockRequest(body);
            const res = createMockResponse();
            
            // 调用处理方法
            server._handleSend(req, res);
            req._emit();
            
            // 等待异步处理
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // 验证消息已发送
            expect(sentMessages.length).toBe(1);
            
            const sentPayload = sentMessages[0].payload;
            
            // 验证 payload 包含附件
            expect(sentPayload).toHaveProperty("attachments");
            expect(Array.isArray(sentPayload.attachments)).toBe(true);
            expect(sentPayload.attachments.length).toBe(attachments.length);
            
            // 验证每个附件引用都被保留
            for (let i = 0; i < attachments.length; i++) {
              const original = attachments[i];
              const sent = sentPayload.attachments[i];
              
              expect(sent.type).toBe(original.type);
              expect(sent.artifactRef).toBe(original.artifactRef);
              expect(sent.filename).toBe(original.filename);
            }
            
            // 验证文本内容
            expect(sentPayload.text).toBe(messageText);
          }
        ),
        { numRuns: 20 }
      );
    });

    it("should allow empty text with attachments", async () => {
      const attachments = [
        { type: "image", artifactRef: "artifact:test-123", filename: "test.jpg" }
      ];
      
      const body = {
        to: "test-agent",
        message: "",
        attachments: attachments
      };
      
      const req = createMockRequest(body);
      const res = createMockResponse();
      
      server._handleSend(req, res);
      req._emit();
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(res.getStatusCode()).toBe(200);
      expect(sentMessages.length).toBe(1);
      expect(sentMessages[0].payload.attachments.length).toBe(1);
    });

    it("should reject request without text and without attachments", async () => {
      const body = {
        to: "test-agent"
      };
      
      const req = createMockRequest(body);
      const res = createMockResponse();
      
      server._handleSend(req, res);
      req._emit();
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(res.getStatusCode()).toBe(400);
      const response = JSON.parse(res.getBody());
      expect(response.error).toBe("missing_text");
    });

    it("should send plain text when no attachments", async () => {
      const body = {
        to: "test-agent",
        message: "Hello world"
      };
      
      const req = createMockRequest(body);
      const res = createMockResponse();
      
      server._handleSend(req, res);
      req._emit();
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(res.getStatusCode()).toBe(200);
      expect(sentMessages.length).toBe(1);
      // 无附件时，payload 应该是纯文本
      expect(sentMessages[0].payload).toBe("Hello world");
    });
  });

  describe("Attachment validation", () => {
    it("should handle empty attachments array as no attachments", async () => {
      const body = {
        to: "test-agent",
        message: "Hello",
        attachments: []
      };
      
      const req = createMockRequest(body);
      const res = createMockResponse();
      
      server._handleSend(req, res);
      req._emit();
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(res.getStatusCode()).toBe(200);
      expect(sentMessages.length).toBe(1);
      // 空附件数组时，payload 应该是纯文本
      expect(sentMessages[0].payload).toBe("Hello");
    });

    it("should preserve attachment metadata fields", async () => {
      const attachments = [
        { type: "image", artifactRef: "artifact:img-001", filename: "photo.jpg" },
        { type: "file", artifactRef: "artifact:doc-002", filename: "document.pdf" }
      ];
      
      const body = {
        to: "test-agent",
        message: "Check these files",
        attachments: attachments
      };
      
      const req = createMockRequest(body);
      const res = createMockResponse();
      
      server._handleSend(req, res);
      req._emit();
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(res.getStatusCode()).toBe(200);
      
      const payload = sentMessages[0].payload;
      expect(payload.attachments[0].type).toBe("image");
      expect(payload.attachments[0].artifactRef).toBe("artifact:img-001");
      expect(payload.attachments[0].filename).toBe("photo.jpg");
      
      expect(payload.attachments[1].type).toBe("file");
      expect(payload.attachments[1].artifactRef).toBe("artifact:doc-002");
      expect(payload.attachments[1].filename).toBe("document.pdf");
    });
  });
});
