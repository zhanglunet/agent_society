import { describe, expect, test } from "bun:test";
import * as fc from "fast-check";
import { MessageBus } from "../../src/platform/message_bus.js";

describe("MessageBus", () => {
  test("delivers FIFO per recipient", () => {
    const bus = new MessageBus();
    bus.send({ to: "a", from: "x", payload: 1 });
    bus.send({ to: "a", from: "x", payload: 2 });
    const m1 = bus.receiveNext("a");
    const m2 = bus.receiveNext("a");
    expect(m1.payload).toBe(1);
    expect(m2.payload).toBe(2);
  });

  // ========== 延迟消息功能测试 ==========

  describe("Delayed Message Delivery", () => {
    
    // 单元测试：延迟消息进入延迟队列
    test("delayed message goes to delayed queue, not immediate queue", () => {
      const bus = new MessageBus();
      const result = bus.send({ to: "a", from: "x", payload: "delayed", delayMs: 1000 });
      
      expect(result.messageId).toBeDefined();
      expect(result.scheduledDeliveryTime).toBeDefined();
      expect(bus.getQueueDepth("a")).toBe(0);  // 不在立即队列
      expect(bus.getDelayedCount("a")).toBe(1);  // 在延迟队列
    });

    // 单元测试：立即消息不返回 scheduledDeliveryTime
    test("immediate message does not return scheduledDeliveryTime", () => {
      const bus = new MessageBus();
      const result = bus.send({ to: "a", from: "x", payload: "immediate" });
      
      expect(result.messageId).toBeDefined();
      expect(result.scheduledDeliveryTime).toBeUndefined();
      expect(bus.getQueueDepth("a")).toBe(1);
      expect(bus.getDelayedCount("a")).toBe(0);
    });

    // 单元测试：字符串形式的 delayMs 应该被正确解析
    test("string delayMs should be parsed correctly", () => {
      const bus = new MessageBus();
      const result = bus.send({ to: "a", from: "x", payload: "delayed", delayMs: "1000" });
      
      expect(result.messageId).toBeDefined();
      expect(result.scheduledDeliveryTime).toBeDefined();
      expect(bus.getQueueDepth("a")).toBe(0);  // 不在立即队列
      expect(bus.getDelayedCount("a")).toBe(1);  // 在延迟队列
    });

    // 单元测试：无效字符串 delayMs 应该被视为 0
    test("invalid string delayMs should be treated as 0", () => {
      const bus = new MessageBus();
      const result = bus.send({ to: "a", from: "x", payload: "immediate", delayMs: "invalid" });
      
      expect(result.messageId).toBeDefined();
      expect(result.scheduledDeliveryTime).toBeUndefined();
      expect(bus.getQueueDepth("a")).toBe(1);  // 立即投递
      expect(bus.getDelayedCount("a")).toBe(0);
    });

    /**
     * Property 3: 零延迟等价于立即投递
     * Feature: delayed-message-delivery, Property 3: 零延迟等价于立即投递
     * Validates: Requirements 1.2
     */
    test("Property 3: zero delay is equivalent to immediate delivery", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 10 }),  // to
          fc.string({ minLength: 1, maxLength: 10 }),  // from
          fc.anything(),  // payload
          (to, from, payload) => {
            const bus1 = new MessageBus();
            const bus2 = new MessageBus();
            
            // 发送零延迟消息
            const result1 = bus1.send({ to, from, payload, delayMs: 0 });
            // 发送无延迟参数消息
            const result2 = bus2.send({ to, from, payload });
            
            // 两者行为应该一致
            expect(result1.scheduledDeliveryTime).toBeUndefined();
            expect(result2.scheduledDeliveryTime).toBeUndefined();
            expect(bus1.getQueueDepth(to)).toBe(bus2.getQueueDepth(to));
            expect(bus1.getDelayedCount(to)).toBe(bus2.getDelayedCount(to));
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 4: 负延迟被规范化为零
     * Feature: delayed-message-delivery, Property 4: 负延迟被规范化为零
     * Validates: Requirements 1.3
     */
    test("Property 4: negative delay is normalized to zero (immediate delivery)", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 10 }),  // to
          fc.string({ minLength: 1, maxLength: 10 }),  // from
          fc.anything(),  // payload
          fc.integer({ min: -1000000, max: -1 }),  // negative delayMs
          (to, from, payload, negativeDelay) => {
            const bus1 = new MessageBus();
            const bus2 = new MessageBus();
            
            // 发送负延迟消息
            const result1 = bus1.send({ to, from, payload, delayMs: negativeDelay });
            // 发送零延迟消息
            const result2 = bus2.send({ to, from, payload, delayMs: 0 });
            
            // 负延迟应该等价于零延迟（立即投递）
            expect(result1.scheduledDeliveryTime).toBeUndefined();
            expect(result2.scheduledDeliveryTime).toBeUndefined();
            expect(bus1.getQueueDepth(to)).toBe(1);
            expect(bus2.getQueueDepth(to)).toBe(1);
            expect(bus1.getDelayedCount(to)).toBe(0);
            expect(bus2.getDelayedCount(to)).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 1: 延迟消息不会提前投递
     * Feature: delayed-message-delivery, Property 1: 延迟消息不会提前投递
     * Validates: Requirements 1.1, 2.1
     */
    test("Property 1: delayed messages are not delivered before their time", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 10 }),  // to
          fc.string({ minLength: 1, maxLength: 10 }),  // from
          fc.anything(),  // payload
          fc.integer({ min: 1000, max: 10000 }),  // delayMs (1-10 seconds)
          (to, from, payload, delayMs) => {
            const bus = new MessageBus();
            
            // 发送延迟消息
            bus.send({ to, from, payload, delayMs });
            
            // 立即检查：消息不应该在立即队列中
            expect(bus.getQueueDepth(to)).toBe(0);
            expect(bus.getDelayedCount(to)).toBe(1);
            
            // 调用 deliverDueMessages，消息不应该被投递（因为时间未到）
            const delivered = bus.deliverDueMessages();
            expect(delivered).toBe(0);
            expect(bus.getQueueDepth(to)).toBe(0);
            expect(bus.getDelayedCount(to)).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 5: 延迟消息保持发送顺序
     * Feature: delayed-message-delivery, Property 5: 延迟消息保持发送顺序
     * Validates: Requirements 2.2
     */
    test("Property 5: delayed messages with same deliverAt maintain send order", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 10 }),  // to
          fc.integer({ min: 2, max: 10 }),  // message count
          (to, count) => {
            const bus = new MessageBus();
            const payloads = [];
            
            // 发送多条消息，使用相同的延迟时间（它们会有相同的 deliverAt）
            for (let i = 0; i < count; i++) {
              payloads.push(i);
              bus.send({ to, from: "sender", payload: i, delayMs: 1 });
            }
            
            // 等待延迟时间过去
            const start = Date.now();
            while (Date.now() - start < 10) {
              // busy wait
            }
            
            // 投递所有到期消息
            bus.deliverDueMessages();
            
            // 验证消息按发送顺序投递
            for (let i = 0; i < count; i++) {
              const msg = bus.receiveNext(to);
              expect(msg).not.toBeNull();
              expect(msg.payload).toBe(payloads[i]);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 6: 关闭时延迟消息被强制投递
     * Feature: delayed-message-delivery, Property 6: 关闭时延迟消息被强制投递
     * Validates: Requirements 4.1
     */
    test("Property 6: forceDeliverAllDelayed delivers all pending delayed messages", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 10 }),  // to
          fc.integer({ min: 1, max: 20 }),  // message count
          fc.integer({ min: 1000, max: 100000 }),  // delayMs
          (to, count, delayMs) => {
            const bus = new MessageBus();
            
            // 发送多条延迟消息
            for (let i = 0; i < count; i++) {
              bus.send({ to, from: "sender", payload: i, delayMs });
            }
            
            // 验证消息在延迟队列中
            expect(bus.getDelayedCount(to)).toBe(count);
            expect(bus.getQueueDepth(to)).toBe(0);
            
            // 强制投递所有延迟消息
            const forcedCount = bus.forceDeliverAllDelayed();
            
            // 验证所有消息被投递
            expect(forcedCount).toBe(count);
            expect(bus.getDelayedCount(to)).toBe(0);
            expect(bus.getQueueDepth(to)).toBe(count);
          }
        ),
        { numRuns: 100 }
      );
    });

    // 单元测试：deliverDueMessages 在时间到达后投递消息
    test("deliverDueMessages delivers messages after delay time", async () => {
      const bus = new MessageBus();
      
      // 发送一条短延迟消息
      bus.send({ to: "a", from: "x", payload: "test", delayMs: 5 });
      
      expect(bus.getQueueDepth("a")).toBe(0);
      expect(bus.getDelayedCount("a")).toBe(1);
      
      // 等待延迟时间过去
      await new Promise(r => setTimeout(r, 20));
      
      // 投递到期消息
      const delivered = bus.deliverDueMessages();
      
      expect(delivered).toBe(1);
      expect(bus.getQueueDepth("a")).toBe(1);
      expect(bus.getDelayedCount("a")).toBe(0);
      
      // 验证消息内容
      const msg = bus.receiveNext("a");
      expect(msg.payload).toBe("test");
    });

    // 单元测试：getDelayedCount 按收件人过滤
    test("getDelayedCount filters by recipient", () => {
      const bus = new MessageBus();
      
      bus.send({ to: "a", from: "x", payload: 1, delayMs: 1000 });
      bus.send({ to: "a", from: "x", payload: 2, delayMs: 1000 });
      bus.send({ to: "b", from: "x", payload: 3, delayMs: 1000 });
      
      expect(bus.getDelayedCount()).toBe(3);
      expect(bus.getDelayedCount("a")).toBe(2);
      expect(bus.getDelayedCount("b")).toBe(1);
      expect(bus.getDelayedCount("c")).toBe(0);
    });
  });
});


// ========== 集成测试 ==========

describe("MessageBus Integration Tests", () => {
  /**
   * 5.1 端到端延迟消息测试
   * 测试完整的延迟消息发送和接收流程
   * Validates: Requirements 1.1, 2.1
   */
  test("end-to-end delayed message flow", async () => {
    const bus = new MessageBus();
    
    // 发送延迟消息
    const result = bus.send({
      to: "agent-1",
      from: "agent-2",
      payload: { task: "delayed task" },
      delayMs: 10
    });
    
    // 验证返回值
    expect(result.messageId).toBeDefined();
    expect(result.scheduledDeliveryTime).toBeDefined();
    
    // 验证消息在延迟队列中
    expect(bus.getDelayedCount("agent-1")).toBe(1);
    expect(bus.getQueueDepth("agent-1")).toBe(0);
    
    // 等待延迟时间
    await new Promise(r => setTimeout(r, 20));
    
    // 投递到期消息
    const delivered = bus.deliverDueMessages();
    expect(delivered).toBe(1);
    
    // 验证消息已移入立即队列
    expect(bus.getDelayedCount("agent-1")).toBe(0);
    expect(bus.getQueueDepth("agent-1")).toBe(1);
    
    // 接收消息
    const msg = bus.receiveNext("agent-1");
    expect(msg).not.toBeNull();
    expect(msg.payload.task).toBe("delayed task");
    expect(msg.from).toBe("agent-2");
  });

  /**
   * 5.2 系统关闭时延迟消息处理测试
   * 测试优雅关闭场景
   * Validates: Requirements 4.1
   */
  test("graceful shutdown delivers all delayed messages", () => {
    const bus = new MessageBus();
    
    // 发送多条延迟消息到不同收件人
    bus.send({ to: "agent-1", from: "sender", payload: { id: 1 }, delayMs: 10000 });
    bus.send({ to: "agent-1", from: "sender", payload: { id: 2 }, delayMs: 20000 });
    bus.send({ to: "agent-2", from: "sender", payload: { id: 3 }, delayMs: 30000 });
    
    // 验证延迟队列状态
    expect(bus.getDelayedCount()).toBe(3);
    expect(bus.getDelayedCount("agent-1")).toBe(2);
    expect(bus.getDelayedCount("agent-2")).toBe(1);
    
    // 模拟优雅关闭：强制投递所有延迟消息
    const forcedCount = bus.forceDeliverAllDelayed();
    
    // 验证所有消息被投递
    expect(forcedCount).toBe(3);
    expect(bus.getDelayedCount()).toBe(0);
    expect(bus.getQueueDepth("agent-1")).toBe(2);
    expect(bus.getQueueDepth("agent-2")).toBe(1);
    
    // 验证消息内容和顺序
    const msg1 = bus.receiveNext("agent-1");
    const msg2 = bus.receiveNext("agent-1");
    const msg3 = bus.receiveNext("agent-2");
    
    expect(msg1.payload.id).toBe(1);
    expect(msg2.payload.id).toBe(2);
    expect(msg3.payload.id).toBe(3);
  });

  /**
   * 混合消息测试：立即消息和延迟消息共存
   */
  test("immediate and delayed messages coexist correctly", async () => {
    const bus = new MessageBus();
    
    // 发送混合消息
    bus.send({ to: "agent-1", from: "sender", payload: { type: "immediate", id: 1 } });
    bus.send({ to: "agent-1", from: "sender", payload: { type: "delayed", id: 2 }, delayMs: 10 });
    bus.send({ to: "agent-1", from: "sender", payload: { type: "immediate", id: 3 } });
    
    // 验证队列状态
    expect(bus.getQueueDepth("agent-1")).toBe(2);  // 2 条立即消息
    expect(bus.getDelayedCount("agent-1")).toBe(1);  // 1 条延迟消息
    
    // 接收立即消息
    const msg1 = bus.receiveNext("agent-1");
    const msg3 = bus.receiveNext("agent-1");
    expect(msg1.payload.id).toBe(1);
    expect(msg3.payload.id).toBe(3);
    
    // 等待延迟消息到期
    await new Promise(r => setTimeout(r, 20));
    bus.deliverDueMessages();
    
    // 接收延迟消息
    const msg2 = bus.receiveNext("agent-1");
    expect(msg2.payload.id).toBe(2);
    expect(msg2.payload.type).toBe("delayed");
  });
});
