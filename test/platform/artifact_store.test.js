import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import path from "node:path";
import { rm } from "node:fs/promises";
import { ArtifactStore } from "../../src/platform/artifact_store.js";

describe("ArtifactStore", () => {
  let store;
  let tempDir;

  beforeEach(async () => {
    tempDir = path.resolve(process.cwd(), `test/.tmp/artifacts_test_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    await rm(tempDir, { recursive: true, force: true });
    store = new ArtifactStore({ artifactsDir: tempDir });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("基础工件操作", () => {
    test("putArtifact then getArtifact returns stored payload", async () => {
      const ref = await store.putArtifact({ type: "json", content: { a: 1 }, meta: { x: "y" } });
      const loaded = await store.getArtifact(ref);

      expect(loaded.type).toBe("json");
      expect(loaded.content).toEqual({ a: 1 });
      expect(loaded.meta).toEqual({ x: "y" });
    });

    test("putArtifact 返回正确的引用格式", async () => {
      const ref = await store.putArtifact({ type: "json", content: { test: "data" } });
      
      expect(ref).toBeDefined();
      expect(ref.startsWith("artifact:")).toBe(true);
    });

    test("getArtifact 支持带前缀和不带前缀的引用", async () => {
      const ref = await store.putArtifact({ type: "json", content: { test: "data" } });
      const id = ref.slice("artifact:".length);
      
      const loaded1 = await store.getArtifact(ref);
      const loaded2 = await store.getArtifact(id);
      
      expect(loaded1.content).toEqual(loaded2.content);
    });

    test("getArtifact 返回 null 对于不存在的工件", async () => {
      const loaded = await store.getArtifact("artifact:nonexistent");
      expect(loaded).toBeNull();
    });

    test("putArtifact 保存字符串内容", async () => {
      const ref = await store.putArtifact({ type: "text", content: "Hello, World!" });
      const loaded = await store.getArtifact(ref);
      
      expect(loaded.content).toBe("Hello, World!");
      expect(loaded.type).toBe("text");
    });

    test("putArtifact 保存对象内容", async () => {
      const content = { name: "test", value: 123, nested: { key: "value" } };
      const ref = await store.putArtifact({ type: "json", content });
      const loaded = await store.getArtifact(ref);
      
      expect(loaded.content).toEqual(content);
    });

    test("putArtifact 保存数组内容", async () => {
      const content = [1, 2, 3, { a: "b" }];
      const ref = await store.putArtifact({ type: "json", content });
      const loaded = await store.getArtifact(ref);
      
      expect(loaded.content).toEqual(content);
    });

    test("putArtifact 保存 messageId", async () => {
      const messageId = "msg-123";
      const ref = await store.putArtifact({ 
        type: "json", 
        content: { test: "data" },
        messageId 
      });
      const loaded = await store.getArtifact(ref);
      
      expect(loaded.messageId).toBe(messageId);
    });

    test("getArtifact 返回完整的工件信息", async () => {
      const ref = await store.putArtifact({ 
        type: "json", 
        content: { test: "data" },
        meta: { author: "test" },
        messageId: "msg-123"
      });
      const loaded = await store.getArtifact(ref);
      
      expect(loaded.id).toBeDefined();
      expect(loaded.content).toBeDefined();
      expect(loaded.type).toBe("json");
      expect(loaded.createdAt).toBeDefined();
      expect(loaded.messageId).toBe("msg-123");
      expect(loaded.meta.author).toBe("test");
      expect(loaded.isBinary).toBeDefined();
    });
  });

  describe("元信息管理", () => {
    test("getMetadata 读取工件元信息", async () => {
      const ref = await store.putArtifact({ 
        type: "json", 
        content: { test: "data" },
        meta: { custom: "value" }
      });
      const id = ref.slice("artifact:".length);
      
      const metadata = await store.getMetadata(id);
      
      expect(metadata).toBeDefined();
      expect(metadata.id).toBe(id);
      expect(metadata.type).toBe("json");
      expect(metadata.extension).toBe(".json");
      expect(metadata.meta.custom).toBe("value");
    });

    test("getMetadata 返回 null 对于不存在的工件", async () => {
      const metadata = await store.getMetadata("nonexistent");
      expect(metadata).toBeNull();
    });
  });

  describe("图片保存", () => {
    test("saveImage 保存图片文件", async () => {
      const buffer = Buffer.from("fake image data");
      const fileName = await store.saveImage(buffer, { 
        format: "png",
        messageId: "msg-123",
        agentId: "agent-1"
      });
      
      expect(fileName).toBeDefined();
      expect(fileName.endsWith(".png")).toBe(true);
    });

    test("saveImage 使用默认格式", async () => {
      const buffer = Buffer.from("fake image data");
      const fileName = await store.saveImage(buffer);
      
      expect(fileName.endsWith(".png")).toBe(true);
    });

    test("saveImage 支持不同的图片格式", async () => {
      const buffer = Buffer.from("fake image data");
      
      const formats = ["png", "jpg", "jpeg", "gif", "webp"];
      for (const format of formats) {
        const fileName = await store.saveImage(buffer, { format });
        expect(fileName.endsWith(`.${format}`)).toBe(true);
      }
    });
  });

  describe("上传文件管理", () => {
    test("saveUploadedFile 保存上传的文件", async () => {
      const buffer = Buffer.from("file content");
      const result = await store.saveUploadedFile(buffer, {
        type: "file",
        filename: "test.txt",
        mimeType: "text/plain"
      });
      
      expect(result.artifactRef).toBeDefined();
      expect(result.artifactRef.startsWith("artifact:")).toBe(true);
      expect(result.metadata).toBeDefined();
      expect(result.metadata.filename).toBe("test.txt");
      expect(result.metadata.mimeType).toBe("text/plain");
      expect(result.metadata.size).toBe(buffer.length);
    });

    test("saveUploadedFile 根据 MIME 类型确定扩展名", async () => {
      const buffer = Buffer.from("image data");
      const result = await store.saveUploadedFile(buffer, {
        type: "image",
        filename: "photo.jpg",
        mimeType: "image/jpeg"
      });
      
      expect(result.metadata.extension).toBe(".jpg");
    });

    test("getUploadedFile 读取上传的文件", async () => {
      const buffer = Buffer.from("file content");
      const saveResult = await store.saveUploadedFile(buffer, {
        type: "file",
        filename: "test.txt",
        mimeType: "text/plain"
      });
      
      const loadResult = await store.getUploadedFile(saveResult.artifactRef);
      
      expect(loadResult).toBeDefined();
      expect(loadResult.buffer).toBeDefined();
      expect(loadResult.buffer.toString()).toBe("file content");
      expect(loadResult.metadata.filename).toBe("test.txt");
    });

    test("getUploadedFile 返回 null 对于不存在的文件", async () => {
      const result = await store.getUploadedFile("artifact:nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("工具方法", () => {
    test("generateId 生成唯一ID", () => {
      const id1 = store.generateId();
      const id2 = store.generateId();
      
      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
    });

    test("isMetaFile 检查是否为元信息文件", () => {
      expect(ArtifactStore.isMetaFile("test.meta")).toBe(true);
      expect(ArtifactStore.isMetaFile("test.json")).toBe(false);
      expect(ArtifactStore.isMetaFile("test.txt")).toBe(false);
    });

    test("META_EXTENSION 返回元信息文件后缀", () => {
      expect(ArtifactStore.META_EXTENSION).toBe(".meta");
    });
  });

  describe("MIME 类型处理", () => {
    test("_resolveMimeType 解析 MIME 类型", () => {
      // 客户端提供具体类型时使用客户端类型
      expect(store._resolveMimeType("image/png", ".jpg")).toBe("image/png");
      
      // 客户端提供通用类型时根据扩展名推断
      expect(store._resolveMimeType("application/octet-stream", ".jpg")).toBe("image/jpeg");
      expect(store._resolveMimeType("application/octet-stream", ".png")).toBe("image/png");
      expect(store._resolveMimeType("application/octet-stream", ".pdf")).toBe("application/pdf");
      
      // 未知扩展名返回通用类型
      expect(store._resolveMimeType("application/octet-stream", ".unknown")).toBe("application/octet-stream");
    });

    test("_getExtensionFromMimeType 从 MIME 类型获取扩展名", () => {
      expect(store._getExtensionFromMimeType("image/jpeg")).toBe(".jpg");
      expect(store._getExtensionFromMimeType("image/png")).toBe(".png");
      expect(store._getExtensionFromMimeType("application/pdf")).toBe(".pdf");
      expect(store._getExtensionFromMimeType("text/plain")).toBe(".txt");
      expect(store._getExtensionFromMimeType("unknown/type")).toBe(".bin");
    });

    test("_getExtensionFromMimeType 优先使用文件名中的扩展名", () => {
      expect(store._getExtensionFromMimeType("image/jpeg", "photo.png")).toBe(".png");
      expect(store._getExtensionFromMimeType("text/plain", "document.md")).toBe(".md");
    });

    test("_extractExtension 从文件名提取扩展名", () => {
      expect(store._extractExtension("test.txt")).toBe(".txt");
      expect(store._extractExtension("photo.jpg")).toBe(".jpg");
      expect(store._extractExtension("document.tar.gz")).toBe(".gz");
      expect(store._extractExtension("noextension")).toBe("");
      expect(store._extractExtension("")).toBe("");
    });
  });

  describe("ensureReady", () => {
    test("ensureReady 创建工件目录", async () => {
      await store.ensureReady();
      // 目录应该已创建，再次调用不应报错
      await store.ensureReady();
    });
  });
});
