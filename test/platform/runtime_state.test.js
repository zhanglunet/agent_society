/**
 * RuntimeState 单元测试
 * 
 * 测试 RuntimeState 类的状态管理功能，包括�?
 * - 智能体注册表管理
 * - 运算状态管�?
 * - 插话队列管理
 * - 对话历史管理
 * - 任务工作空间映射
 * - 状态锁管理
 */

import { describe, expect, test, beforeEach } from "bun:test";
import { RuntimeState } from "../../src/platform/runtime/runtime_state.js";

describe("RuntimeState", () => {
  let state;
  
  beforeEach(() => {
    state = new RuntimeState({
      logger: null,
      onComputeStatusChange: null
    });
  });

  describe("智能体注册表管理", () => {
    test("注册和获取智能体", () => {
      const agent = { id: "agent1", roleId: "role1", roleName: "test" };
      
      state.registerAgent(agent);
      
      expect(state.hasAgent("agent1")).toBe(true);
      expect(state.getAgent("agent1")).toEqual(agent);
      expect(state.getAgentCount()).toBe(1);
    });

    test("获取不存在的智能体返�?undefined", () => {
      expect(state.getAgent("nonexistent")).toBeUndefined();
      expect(state.hasAgent("nonexistent")).toBe(false);
    });

    test("获取所有智能体ID", () => {
      state.registerAgent({ id: "agent1", roleId: "role1" });
      state.registerAgent({ id: "agent2", roleId: "role2" });
      
      const ids = Array.from(state.getAllAgentIds());
      expect(ids).toContain("agent1");
      expect(ids).toContain("agent2");
      expect(ids.length).toBe(2);
    });

    test("获取所有智能体实例", () => {
      const agent1 = { id: "agent1", roleId: "role1" };
      const agent2 = { id: "agent2", roleId: "role2" };
      
      state.registerAgent(agent1);
      state.registerAgent(agent2);
      
      const agents = state.getAllAgents();
      expect(agents).toContain(agent1);
      expect(agents).toContain(agent2);
      expect(agents.length).toBe(2);
    });

    test("设置和获取智能体元数�?, () => {
      const meta = { roleId: "role1", parentAgentId: "root" };
      
      state.setAgentMeta("agent1", meta);
      
      expect(state.getAgentMeta("agent1")).toEqual(meta);
    });

    test("获取不存在的元数据返�?undefined", () => {
      expect(state.getAgentMeta("nonexistent")).toBeUndefined();
    });
  });

  describe("运算状态管�?, () => {
    test("设置和获取智能体运算状�?, () => {
      state.setAgentComputeStatus("agent1", "waiting_llm");
      
      expect(state.getAgentComputeStatus("agent1")).toBe("waiting_llm");
    });

    test("未设置状态的智能体默认为 idle", () => {
      expect(state.getAgentComputeStatus("agent1")).toBe("idle");
    });

    test("获取所有智能体运算状�?, () => {
      state.setAgentComputeStatus("agent1", "waiting_llm");
      state.setAgentComputeStatus("agent2", "processing");
      
      const allStatus = state.getAllAgentComputeStatus();
      
      expect(allStatus.agent1).toBe("waiting_llm");
      expect(allStatus.agent2).toBe("processing");
    });

    test("状态变更触发回�?, () => {
      let callbackCalled = false;
      let callbackAgentId = null;
      let callbackStatus = null;
      
      const stateWithCallback = new RuntimeState({
        logger: null,
        onComputeStatusChange: (agentId, status) => {
          callbackCalled = true;
          callbackAgentId = agentId;
          callbackStatus = status;
        }
      });
      
      stateWithCallback.setAgentComputeStatus("agent1", "waiting_llm");
      
      expect(callbackCalled).toBe(true);
      expect(callbackAgentId).toBe("agent1");
      expect(callbackStatus).toBe("waiting_llm");
    });

    test("标记和取消智能体活跃处理", () => {
      state.markAgentAsActivelyProcessing("agent1");
      
      expect(state.isAgentActivelyProcessing("agent1")).toBe(true);
      expect(state.getActiveProcessingCount()).toBe(1);
      
      state.unmarkAgentAsActivelyProcessing("agent1");
      
      expect(state.isAgentActivelyProcessing("agent1")).toBe(false);
      expect(state.getActiveProcessingCount()).toBe(0);
    });

    test("获取所有活跃处理的智能�?, () => {
      state.markAgentAsActivelyProcessing("agent1");
      state.markAgentAsActivelyProcessing("agent2");
      
      const activeAgents = state.getActiveProcessingAgents();
      
      expect(activeAgents).toContain("agent1");
      expect(activeAgents).toContain("agent2");
      expect(activeAgents.length).toBe(2);
    });
  });

  describe("插话队列管理", () => {
    test("添加插话消息", () => {
      const message = { id: "msg1", from: "agent2", payload: "test" };
      
      state.addInterruption("agent1", message);
      
      expect(state.hasInterruptions("agent1")).toBe(true);
      expect(state.getInterruptionCount("agent1")).toBe(1);
    });

    test("获取并清空插话队�?, () => {
      const msg1 = { id: "msg1", from: "agent2" };
      const msg2 = { id: "msg2", from: "agent3" };
      
      state.addInterruption("agent1", msg1);
      state.addInterruption("agent1", msg2);
      
      const interruptions = state.getAndClearInterruptions("agent1");
      
      expect(interruptions.length).toBe(2);
      expect(interruptions[0]).toEqual(msg1);
      expect(interruptions[1]).toEqual(msg2);
      // 清空后应该没有中�?
      expect(state.hasInterruptions("agent1")).toBeFalsy();
    });

    test("获取空队列返回空数组", () => {
      const interruptions = state.getAndClearInterruptions("agent1");
      
      expect(interruptions).toEqual([]);
    });

    test("检查不存在的队列返�?false", () => {
      // hasInterruptions 对于不存在的队列返回 undefined（falsy�?
      expect(state.hasInterruptions("nonexistent")).toBeFalsy();
      expect(state.getInterruptionCount("nonexistent")).toBe(0);
    });
  });

  describe("对话历史管理", () => {
    test("获取对话历史引用", () => {
      const conversations = state.getConversations();
      
      expect(conversations).toBeInstanceOf(Map);
    });

    test("获取指定智能体的对话历史", () => {
      const conv = [{ role: "system", content: "test" }];
      state._conversations.set("agent1", conv);
      
      expect(state.getConversation("agent1")).toEqual(conv);
    });

    test("获取不存在的对话历史返回 undefined", () => {
      expect(state.getConversation("nonexistent")).toBeUndefined();
    });
  });

  describe("任务工作空间映射", () => {
    test("设置和获取任务工作空�?, () => {
      state.setTaskWorkspace("task1", "/path/to/workspace");
      
      expect(state.getTaskWorkspace("task1")).toBe("/path/to/workspace");
    });

    test("获取不存在的工作空间返回 undefined", () => {
      expect(state.getTaskWorkspace("nonexistent")).toBeUndefined();
    });

    test("设置和获取智能体任务委托�?, () => {
      const taskBrief = { taskId: "task1", description: "test task" };
      
      state.setAgentTaskBrief("agent1", taskBrief);
      
      expect(state.getAgentTaskBrief("agent1")).toEqual(taskBrief);
    });

    test("获取不存在的任务委托书返�?undefined", () => {
      expect(state.getAgentTaskBrief("nonexistent")).toBeUndefined();
    });
  });

  describe("状态锁管理", () => {
    test("获取和释放状态锁", async () => {
      const releaseFn = await state.acquireLock("agent1");
      
      expect(typeof releaseFn).toBe("function");
      
      state.releaseLock(releaseFn);
    });

    test("状态锁保证串行执行", async () => {
      const executionOrder = [];
      
      // 第一个操�?
      const op1 = (async () => {
        const release = await state.acquireLock("agent1");
        executionOrder.push("op1-start");
        await new Promise(r => setTimeout(r, 10));
        executionOrder.push("op1-end");
        state.releaseLock(release);
      })();
      
      // 第二个操作（应该等待第一个完成）
      const op2 = (async () => {
        const release = await state.acquireLock("agent1");
        executionOrder.push("op2-start");
        executionOrder.push("op2-end");
        state.releaseLock(release);
      })();
      
      await Promise.all([op1, op2]);
      
      expect(executionOrder).toEqual(["op1-start", "op1-end", "op2-start", "op2-end"]);
    });

    test("不同智能体的锁互不影�?, async () => {
      const executionOrder = [];
      
      const op1 = (async () => {
        const release = await state.acquireLock("agent1");
        executionOrder.push("agent1-start");
        await new Promise(r => setTimeout(r, 10));
        executionOrder.push("agent1-end");
        state.releaseLock(release);
      })();
      
      const op2 = (async () => {
        const release = await state.acquireLock("agent2");
        executionOrder.push("agent2-start");
        executionOrder.push("agent2-end");
        state.releaseLock(release);
      })();
      
      await Promise.all([op1, op2]);
      
      // agent2 应该�?agent1 完成前就开始执�?
      const agent2StartIndex = executionOrder.indexOf("agent2-start");
      const agent1EndIndex = executionOrder.indexOf("agent1-end");
      expect(agent2StartIndex).toBeLessThan(agent1EndIndex);
    });
  });
});
