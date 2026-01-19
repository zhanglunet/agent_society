/**
 * 创建“协调岗”的行为：接收任务→自组织创建写作岗→委派→汇总回传。
 * @returns {(ctx:any, message:any)=>Promise<void>}
 */
import { randomUUID } from "node:crypto";

export function createCoordinatorBehavior() {
  const pending = new Map();

  return async (ctx, message) => {
    if (message?.payload?.kind === "task") {
      const taskId = message.taskId ?? randomUUID();
      pending.set(taskId, { upstream: message.from });

      let writerRole = ctx.tools.findRoleByName("writer");
      if (!writerRole) {
        writerRole = await ctx.tools.createRole({
          name: "writer",
          rolePrompt: "你是写作岗：收到任务后生成简短文字结果并输出为工件，然后通过异步消息回传。"
        });
      }

      const writer = await ctx.tools.spawnAgent({
        roleId: writerRole.id
      });

      ctx.tools.sendMessage({
        to: writer.id,
        from: ctx.agent.id,
        taskId,
        payload: message.payload
      });
      return;
    }

    if (message?.payload?.kind === "result") {
      const taskId = message.taskId;
      const state = pending.get(taskId);
      if (!state) return;
      pending.delete(taskId);

      ctx.tools.sendMessage({
        to: state.upstream,
        from: ctx.agent.id,
        taskId,
        payload: message.payload
      });
    }
  };
}

/**
 * 创建“写作岗”的行为：生成结果工件并回传。
 * @returns {(ctx:any, message:any)=>Promise<void>}
 */
export function createWriterBehavior() {
  return async (ctx, message) => {
    if (message?.payload?.kind !== "task") return;

    const summary =
      "【写作岗产出】\n" +
      "平台只提供能力（创建岗位/智能体、异步消息、工件存储与提示词加载等），不内置组织社会规则；组织如何演化由智能体通过岗位提示词与消息协作自组织决定。\n" +
      "演示链路：User → Root → Coordinator → Writer → Artifact → Coordinator → Root。\n\n" +
      `【原始任务】\n${String(message.payload?.text ?? "")}\n`;
    const ref = await ctx.tools.putArtifact({
      name: "任务执行总结",
      type: "text",
      content: summary,
      meta: { producer: ctx.agent.id, role: ctx.agent.roleName }
    });

    ctx.tools.sendMessage({
      to: message.from,
      from: ctx.agent.id,
      taskId: message.taskId,
      payload: { kind: "result", artifactRef: ref }
    });
  };
}
