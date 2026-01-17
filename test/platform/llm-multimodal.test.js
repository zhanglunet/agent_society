/**
 * LLM 多模态消息属性测试
 * Property 7: LLM Request Multimodal Format
 * 
 * Requirements: 6.1, 6.2
 */

import { describe, it, expect } from "bun:test";
import fc from "fast-check";
import { 
  formatMessageForAgent, 
  formatMultimodalContent, 
  hasImageAttachments, 
  getImageAttachments 
} from "../../src/platform/utils/message/message_formatter.js";

describe("LLM Multimodal Message Properties", () => {
  
  describe("hasImageAttachments", () => {
    it("should return true for messages with image attachments", () => {
      const message = {
        from: "user",
        payload: {
          text: "Check this image",
          attachments: [
            { type: "image", artifactRef: "artifact:123", filename: "test.jpg" }
          ]
        }
      };
      
      expect(hasImageAttachments(message)).toBe(true);
    });
    
    it("should return false for messages without attachments", () => {
      const message = {
        from: "user",
        payload: { text: "Hello" }
      };
      
      expect(hasImageAttachments(message)).toBe(false);
    });
    
    it("should return false for messages with only file attachments", () => {
      const message = {
        from: "user",
        payload: {
          text: "Check this file",
          attachments: [
            { type: "file", artifactRef: "artifact:456", filename: "doc.pdf" }
          ]
        }
      };
      
      expect(hasImageAttachments(message)).toBe(false);
    });
    
    it("should return true for mixed attachments with at least one image", () => {
      const message = {
        from: "user",
        payload: {
          text: "Check these",
          attachments: [
            { type: "file", artifactRef: "artifact:456", filename: "doc.pdf" },
            { type: "image", artifactRef: "artifact:789", filename: "photo.jpg" }
          ]
        }
      };
      
      expect(hasImageAttachments(message)).toBe(true);
    });
  });
  
  describe("getImageAttachments", () => {
    it("should return only image attachments", () => {
      const message = {
        from: "user",
        payload: {
          text: "Check these",
          attachments: [
            { type: "file", artifactRef: "artifact:456", filename: "doc.pdf" },
            { type: "image", artifactRef: "artifact:789", filename: "photo.jpg" },
            { type: "image", artifactRef: "artifact:101", filename: "screenshot.png" }
          ]
        }
      };
      
      const images = getImageAttachments(message);
      expect(images.length).toBe(2);
      expect(images[0].filename).toBe("photo.jpg");
      expect(images[1].filename).toBe("screenshot.png");
    });
    
    it("should return empty array for messages without images", () => {
      const message = {
        from: "user",
        payload: { text: "Hello" }
      };
      
      expect(getImageAttachments(message)).toEqual([]);
    });
  });
  
  describe("formatMessageForAgent with attachments", () => {
    it("should include attachment list in formatted message", () => {
      const message = {
        from: "user",
        payload: {
          text: "Please analyze this image",
          attachments: [
            { type: "image", artifactRef: "artifact:img-001", filename: "photo.jpg" },
            { type: "file", artifactRef: "artifact:doc-002", filename: "report.pdf" }
          ]
        }
      };
      
      const formatted = formatMessageForAgent(message, { role: "user" });
      
      expect(formatted).toContain("【来自用户的消息】");
      expect(formatted).toContain("Please analyze this image");
      expect(formatted).toContain("【附件列表】");
      expect(formatted).toContain("[图片] photo.jpg");
      expect(formatted).toContain("[文件] report.pdf");
      expect(formatted).toContain("artifact:img-001");
      expect(formatted).toContain("artifact:doc-002");
    });
    
    it("should handle messages with only attachments (no text)", () => {
      const message = {
        from: "user",
        payload: {
          text: "",
          attachments: [
            { type: "image", artifactRef: "artifact:img-001", filename: "photo.jpg" }
          ]
        }
      };
      
      const formatted = formatMessageForAgent(message, { role: "user" });
      
      expect(formatted).toContain("【附件列表】");
      expect(formatted).toContain("[图片] photo.jpg");
    });
  });
  
  describe("Property 7: formatMultimodalContent", () => {
    it("should return plain text when no attachments", async () => {
      const result = await formatMultimodalContent("Hello world", [], async () => null);
      expect(result).toBe("Hello world");
    });
    
    it("should return plain text when no image attachments", async () => {
      const attachments = [
        { type: "file", artifactRef: "artifact:doc", filename: "doc.pdf" }
      ];
      const result = await formatMultimodalContent("Check this file", attachments, async () => null);
      expect(result).toBe("Check this file");
    });
    
    it("should return multimodal array with image attachments", async () => {
      const attachments = [
        { type: "image", artifactRef: "artifact:img", filename: "photo.jpg" }
      ];
      
      const mockGetImageBase64 = async (ref) => ({
        data: "base64encodeddata",
        mimeType: "image/jpeg"
      });
      
      const result = await formatMultimodalContent("Analyze this", attachments, mockGetImageBase64);
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      
      // First element should be text
      expect(result[0].type).toBe("text");
      expect(result[0].text).toBe("Analyze this");
      
      // Second element should be image_url
      expect(result[1].type).toBe("image_url");
      expect(result[1].image_url.url).toContain("data:image/jpeg;base64,");
      expect(result[1].image_url.url).toContain("base64encodeddata");
    });
    
    it("should handle multiple images", async () => {
      const attachments = [
        { type: "image", artifactRef: "artifact:img1", filename: "photo1.jpg" },
        { type: "image", artifactRef: "artifact:img2", filename: "photo2.png" }
      ];
      
      const mockGetImageBase64 = async (ref) => ({
        data: `data_for_${ref}`,
        mimeType: ref.includes("img1") ? "image/jpeg" : "image/png"
      });
      
      const result = await formatMultimodalContent("Compare these", attachments, mockGetImageBase64);
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(3); // 1 text + 2 images
      
      expect(result[0].type).toBe("text");
      expect(result[1].type).toBe("image_url");
      expect(result[2].type).toBe("image_url");
    });
    
    it("should handle image load failure gracefully", async () => {
      const attachments = [
        { type: "image", artifactRef: "artifact:broken", filename: "broken.jpg" }
      ];
      
      const mockGetImageBase64 = async (ref) => {
        throw new Error("Image not found");
      };
      
      const result = await formatMultimodalContent("Check this", attachments, mockGetImageBase64);
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(result[0].type).toBe("text");
      expect(result[0].text).toBe("Check this");
      expect(result[1].type).toBe("text");
      expect(result[1].text).toContain("图片加载失败");
      expect(result[1].text).toContain("broken.jpg");
    });
    
    it("should filter out file attachments and only process images", async () => {
      const attachments = [
        { type: "file", artifactRef: "artifact:doc", filename: "doc.pdf" },
        { type: "image", artifactRef: "artifact:img", filename: "photo.jpg" },
        { type: "file", artifactRef: "artifact:txt", filename: "notes.txt" }
      ];
      
      const mockGetImageBase64 = async (ref) => ({
        data: "imagedata",
        mimeType: "image/jpeg"
      });
      
      const result = await formatMultimodalContent("Check these", attachments, mockGetImageBase64);
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2); // 1 text + 1 image (files are ignored)
    });
    
    it("Property: multimodal content should have correct OpenAI Vision API format", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 500 }),
          fc.array(
            fc.record({
              type: fc.constant("image"),
              artifactRef: fc.string({ minLength: 1, maxLength: 50 }).map(s => `artifact:${s.replace(/[^a-zA-Z0-9-]/g, '')}`),
              filename: fc.string({ minLength: 1, maxLength: 50 }).map(s => (s.replace(/[^a-zA-Z0-9._-]/g, '') || "img") + ".jpg")
            }),
            { minLength: 1, maxLength: 3 }
          ),
          async (text, attachments) => {
            const mockGetImageBase64 = async (ref) => ({
              data: Buffer.from(`mock_data_${ref}`).toString('base64'),
              mimeType: "image/jpeg"
            });
            
            const result = await formatMultimodalContent(text, attachments, mockGetImageBase64);
            
            // Should be an array
            expect(Array.isArray(result)).toBe(true);
            
            // First element should be text
            expect(result[0].type).toBe("text");
            expect(result[0].text).toBe(text);
            
            // Remaining elements should be image_url
            for (let i = 1; i < result.length; i++) {
              expect(result[i].type).toBe("image_url");
              expect(result[i].image_url).toBeDefined();
              expect(result[i].image_url.url).toMatch(/^data:image\/jpeg;base64,/);
            }
            
            // Number of image elements should match attachments
            expect(result.length).toBe(1 + attachments.length);
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});
