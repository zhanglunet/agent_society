import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { validateTaskBrief, formatTaskBrief } from "../../src/platform/utils/message/task_brief.js";

describe("TaskBrief", () => {
  /**
   * Property 1: Task Brief 验证
   * *For any* Task_Brief 对象，如果缺少任何必填字段（objective、constraints、inputs、outputs、completion_criteria），
   * �?validateTaskBrief 函数应返�?valid=false 并列出所有缺失字段�?
   * 
   * **Validates: Requirements 1.2, 1.4**
   * **Feature: agent-communication-protocol, Property 1: Task Brief 验证**
   */
  test("Property 1: Task Brief 验证 - 缺少必填字段时应返回 valid=false", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          objective: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
          constraints: fc.option(fc.array(fc.string()), { nil: undefined }),
          inputs: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
          outputs: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
          completion_criteria: fc.option(fc.string({ minLength: 1 }), { nil: undefined })
        }),
        async (taskBrief) => {
          const result = validateTaskBrief(taskBrief);
          
          const hasMissingFields = 
            taskBrief.objective === undefined ||
            taskBrief.constraints === undefined ||
            taskBrief.inputs === undefined ||
            taskBrief.outputs === undefined ||
            taskBrief.completion_criteria === undefined;
          
          // 验证：valid 应该等于 !hasMissingFields
          expect(result.valid).toBe(!hasMissingFields);
          
          // 验证：如果有缺失字段，errors 应该包含对应的错误信�?
          if (hasMissingFields) {
            expect(result.errors.length).toBeGreaterThan(0);
            
            if (taskBrief.objective === undefined) {
              expect(result.errors.some(e => e.includes('objective'))).toBe(true);
            }
            if (taskBrief.constraints === undefined) {
              expect(result.errors.some(e => e.includes('constraints'))).toBe(true);
            }
            if (taskBrief.inputs === undefined) {
              expect(result.errors.some(e => e.includes('inputs'))).toBe(true);
            }
            if (taskBrief.outputs === undefined) {
              expect(result.errors.some(e => e.includes('outputs'))).toBe(true);
            }
            if (taskBrief.completion_criteria === undefined) {
              expect(result.errors.some(e => e.includes('completion_criteria'))).toBe(true);
            }
          } else {
            expect(result.errors.length).toBe(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  test("Property 1: Task Brief 验证 - constraints 必须是数�?, async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          objective: fc.string({ minLength: 1 }),
          constraints: fc.oneof(
            fc.array(fc.string()),  // 有效：数�?
            fc.string(),            // 无效：字符串
            fc.integer(),           // 无效：数�?
            fc.record({})           // 无效：对�?
          ),
          inputs: fc.string({ minLength: 1 }),
          outputs: fc.string({ minLength: 1 }),
          completion_criteria: fc.string({ minLength: 1 })
        }),
        async (taskBrief) => {
          const result = validateTaskBrief(taskBrief);
          const constraintsIsArray = Array.isArray(taskBrief.constraints);
          
          if (!constraintsIsArray) {
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('constraints') && e.includes('数组'))).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  test("Property 1: Task Brief 验证 - null 和非对象输入应返回错�?, async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.constant(null),
          fc.constant(undefined),
          fc.string(),
          fc.integer(),
          fc.array(fc.anything())
        ),
        async (invalidInput) => {
          const result = validateTaskBrief(invalidInput);
          expect(result.valid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("完整有效�?TaskBrief 应通过验证", () => {
    const validTaskBrief = {
      objective: "创建一个简单的计算器程�?,
      constraints: ["使用 HTML + JavaScript 实现", "必须是静态网�?],
      inputs: "用户通过网页界面输入数字和运算符",
      outputs: "在网页上显示计算结果",
      completion_criteria: "计算器能正确执行加减乘除运算"
    };
    
    const result = validateTaskBrief(validTaskBrief);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });
});

describe("formatTaskBrief", () => {
  test("格式化完整的 TaskBrief 应包含所有字�?, () => {
    const taskBrief = {
      objective: "创建一个简单的计算器程�?,
      constraints: ["使用 HTML + JavaScript 实现", "必须是静态网�?],
      inputs: "用户通过网页界面输入数字和运算符",
      outputs: "在网页上显示计算结果",
      completion_criteria: "计算器能正确执行加减乘除运算",
      collaborators: [
        { agentId: "agent-ui", role: "UI设计�?, description: "界面设计支持" }
      ],
      references: ["参考现有计算器应用"],
      priority: "high"
    };
    
    const formatted = formatTaskBrief(taskBrief);
    
    // 验证包含标题
    expect(formatted).toContain("【任务委托书 Task Brief�?);
    
    // 验证包含必填字段
    expect(formatted).toContain("## 目标描述");
    expect(formatted).toContain(taskBrief.objective);
    expect(formatted).toContain("## 技术约�?);
    expect(formatted).toContain("使用 HTML + JavaScript 实现");
    expect(formatted).toContain("必须是静态网�?);
    expect(formatted).toContain("## 输入说明");
    expect(formatted).toContain(taskBrief.inputs);
    expect(formatted).toContain("## 输出要求");
    expect(formatted).toContain(taskBrief.outputs);
    expect(formatted).toContain("## 完成标准");
    expect(formatted).toContain(taskBrief.completion_criteria);
    
    // 验证包含可选字�?
    expect(formatted).toContain("## 协作联系�?);
    expect(formatted).toContain("UI设计�?);
    expect(formatted).toContain("## 参考资�?);
    expect(formatted).toContain("参考现有计算器应用");
    expect(formatted).toContain("## 优先�?);
    expect(formatted).toContain("high");
  });

  test("格式�?null 或非对象输入应返回空字符�?, () => {
    expect(formatTaskBrief(null)).toBe("");
    expect(formatTaskBrief(undefined)).toBe("");
    expect(formatTaskBrief("string")).toBe("");
    expect(formatTaskBrief(123)).toBe("");
  });

  test("格式化只有部分字段的 TaskBrief 应只包含存在的字�?, () => {
    const partialTaskBrief = {
      objective: "测试目标",
      constraints: ["约束1"]
    };
    
    const formatted = formatTaskBrief(partialTaskBrief);
    
    expect(formatted).toContain("## 目标描述");
    expect(formatted).toContain("测试目标");
    expect(formatted).toContain("## 技术约�?);
    expect(formatted).toContain("约束1");
    expect(formatted).not.toContain("## 输入说明");
    expect(formatted).not.toContain("## 输出要求");
    expect(formatted).not.toContain("## 完成标准");
  });
});
