import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { 
  validateMessageFormat, 
  isValidMessageType, 
  MessageType, 
  VALID_MESSAGE_TYPES 
} from "../../src/platform/utils/message/message_validator.js";

describe("MessageValidator", () => {
  /**
   * Property 10: 消息类型验证
   * *For any* 包含 message_type 字段的消息，系统应验�?payload 符合该类型的格式要求�?
   * - task_assignment 需包含 TaskBrief 结构
   * - introduction_request 需包含 reason �?required_capability
   * - introduction_response 需包含目标智能体信�?
   * 
   * **Validates: Requirements 8.2, 8.3, 8.4, 8.5**
   * **Feature: agent-communication-protocol, Property 10: 消息类型验证**
   */
  
  test("Property 10: task_assignment 消息必须包含 TaskBrief 结构", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          message_type: fc.constant('task_assignment'),
          objective: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
          constraints: fc.option(fc.array(fc.string()), { nil: undefined }),
          inputs: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
          outputs: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
          completion_criteria: fc.option(fc.string({ minLength: 1 }), { nil: undefined })
        }),
        async (payload) => {
          const result = validateMessageFormat(payload);
          
          const hasAllRequiredFields = 
            payload.objective !== undefined &&
            payload.constraints !== undefined &&
            payload.inputs !== undefined &&
            payload.outputs !== undefined &&
            payload.completion_criteria !== undefined;
          
          const constraintsIsArray = payload.constraints === undefined || Array.isArray(payload.constraints);
          
          // 验证：如果缺少必填字段或 constraints 不是数组，应返回 valid=false
          if (!hasAllRequiredFields || !constraintsIsArray) {
            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
          } else {
            expect(result.valid).toBe(true);
            expect(result.errors.length).toBe(0);
          }
          
          expect(result.message_type).toBe('task_assignment');
        }
      ),
      { numRuns: 100 }
    );
  });

  test("Property 10: introduction_request 消息必须包含 reason �?required_capability", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          message_type: fc.constant('introduction_request'),
          reason: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
          required_capability: fc.option(fc.string({ minLength: 1 }), { nil: undefined })
        }),
        async (payload) => {
          const result = validateMessageFormat(payload);
          
          const hasReason = payload.reason !== undefined && payload.reason !== null && payload.reason !== '';
          const hasRequiredCapability = payload.required_capability !== undefined && 
                                        payload.required_capability !== null && 
                                        payload.required_capability !== '';
          
          // 验证：如果缺�?reason �?required_capability，应返回 valid=false
          if (!hasReason || !hasRequiredCapability) {
            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
            
            if (!hasReason) {
              expect(result.errors.some(e => e.includes('reason'))).toBe(true);
            }
            if (!hasRequiredCapability) {
              expect(result.errors.some(e => e.includes('required_capability'))).toBe(true);
            }
          } else {
            expect(result.valid).toBe(true);
            expect(result.errors.length).toBe(0);
          }
          
          expect(result.message_type).toBe('introduction_request');
        }
      ),
      { numRuns: 100 }
    );
  });

  test("Property 10: introduction_response 消息必须包含目标智能体信�?, async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          message_type: fc.constant('introduction_response'),
          targetAgentId: fc.option(fc.uuid(), { nil: undefined }),
          roleName: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
          interfaceSpec: fc.option(fc.record({
            services: fc.string(),
            input_format: fc.string(),
            output_format: fc.string()
          }), { nil: undefined })
        }),
        async (payload) => {
          const result = validateMessageFormat(payload);
          
          const hasTargetAgentId = payload.targetAgentId !== undefined && 
                                   payload.targetAgentId !== null && 
                                   payload.targetAgentId !== '';
          
          // 验证：如果缺�?targetAgentId，应返回 valid=false
          if (!hasTargetAgentId) {
            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors.some(e => e.includes('targetAgentId') || e.includes('目标智能�?))).toBe(true);
          } else {
            expect(result.valid).toBe(true);
            expect(result.errors.length).toBe(0);
          }
          
          expect(result.message_type).toBe('introduction_response');
        }
      ),
      { numRuns: 100 }
    );
  });

  test("Property 10: 无效�?message_type 应返回错�?, async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          message_type: fc.string({ minLength: 1 }).filter(s => !VALID_MESSAGE_TYPES.includes(s))
        }),
        async (payload) => {
          const result = validateMessageFormat(payload);
          
          expect(result.valid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
          expect(result.errors.some(e => e.includes('无效�?message_type'))).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("Property 10: general 类型消息不需要特殊验�?, async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          message_type: fc.constant('general'),
          text: fc.option(fc.string(), { nil: undefined }),
          content: fc.option(fc.string(), { nil: undefined })
        }),
        async (payload) => {
          const result = validateMessageFormat(payload);
          
          // general 类型总是有效�?
          expect(result.valid).toBe(true);
          expect(result.errors.length).toBe(0);
          expect(result.message_type).toBe('general');
        }
      ),
      { numRuns: 100 }
    );
  });

  test("Property 10: 没有 message_type 的消息视为有�?, async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          text: fc.option(fc.string(), { nil: undefined }),
          content: fc.option(fc.string(), { nil: undefined })
        }),
        async (payload) => {
          const result = validateMessageFormat(payload);
          
          // 没有 message_type 的消息总是有效�?
          expect(result.valid).toBe(true);
          expect(result.errors.length).toBe(0);
          expect(result.message_type).toBe(null);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe("isValidMessageType", () => {
  test("应正确识别有效的消息类型", () => {
    for (const type of VALID_MESSAGE_TYPES) {
      expect(isValidMessageType(type)).toBe(true);
    }
  });

  test("应正确识别无效的消息类型", () => {
    expect(isValidMessageType('invalid_type')).toBe(false);
    expect(isValidMessageType('')).toBe(false);
    expect(isValidMessageType(null)).toBe(false);
    expect(isValidMessageType(undefined)).toBe(false);
  });
});

describe("MessageType 枚举", () => {
  test("应包含所有预期的消息类型", () => {
    expect(MessageType.TASK_ASSIGNMENT).toBe('task_assignment');
    expect(MessageType.STATUS_REPORT).toBe('status_report');
    expect(MessageType.INTRODUCTION_REQUEST).toBe('introduction_request');
    expect(MessageType.INTRODUCTION_RESPONSE).toBe('introduction_response');
    expect(MessageType.COLLABORATION_REQUEST).toBe('collaboration_request');
    expect(MessageType.COLLABORATION_RESPONSE).toBe('collaboration_response');
    expect(MessageType.GENERAL).toBe('general');
  });
});
