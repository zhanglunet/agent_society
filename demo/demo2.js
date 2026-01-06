import readline from "node:readline";
import { AgentSociety } from "../src/platform/agent_society.js";

const helpText = [
  "本 Demo 演示：用本项目的 AgentSociety 跑一个“饭店”多智能体协作场景。",
  "你在命令行里输入文本；系统把文本发给指定智能体，由它自组织创建并协调饭店员工智能体。",
  "",
  "本地指令：",
  "- help：显示帮助",
  "- exit：退出",
  "- target：查看当前默认发送目标",
  "- use <agentId>：切换默认发送目标",
  "- to <agentId> <文本>：向指定智能体发送一条文本",
  "",
  "顾客指令（通常发给任务入口智能体）：",
  "- menu：看菜单",
  "- order <菜品ID> [数量]：点餐（如：order A1 2）",
  "- cart：看购物车/状态",
  "- submit：确认下单",
  "- bill：结账",
  "- pay card | pay cash <金额>：付款",
].join("\n");

function makeReadline() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const question = (q) => new Promise((resolve) => rl.question(q, (a) => resolve(String(a ?? ""))));
  return { rl, question };
}

function buildRestaurantRequirement() {
  return [
    "目标：构建一个可在命令行交互的“模拟饭店”，让用户作为顾客点餐、下单、出菜、结账付款。",
    "约束：你是 Root 为本 taskId 创建的第一个直属子智能体（任务入口/负责人）。你需要用 create_role / spawn_agent 自组织创建饭店员工智能体（至少包含：迎宾、服务员、后厨、收银、库存）。",
    "交互：用户后续会不断发送短文本命令（menu/order/cart/submit/bill/pay/exit），你要解析并推进状态机。",
    "数据：你需要内置一个小菜单（至少 6 个菜品，包含 ID/名称/单价），并有库存（可扣减）。",
    "输出：所有对用户的输出必须 send_message(to=user, taskId 保持不变, payload.text 为纯文本)。",
    "完成标准：用户输入 exit 时，向用户输出一句“已退出饭店模拟”，然后 wait_for_message。",
    "提示：组织里可以有多个智能体直接向用户 send_message；不要求只有你能对接用户。",
  ].join("\n");
}

async function waitForTaskEntryAgentId(system, taskId) {
  const msg = await system.waitForUserMessage(
    (m) => m?.taskId === taskId && m?.from === "root" && m?.payload?.agentId,
    { timeoutMs: 60_000 }
  );
  return msg?.payload?.agentId ? String(msg.payload.agentId) : null;
}

async function main() {
  // 使用自定义数据目录，避免与其他实例冲突
  const system = new AgentSociety({ dataDir: "data/demo2" });
  await system.init();

  const { taskId } = await system.submitRequirement(buildRestaurantRequirement());
  const entryAgentId = await waitForTaskEntryAgentId(system, taskId);
  if (!entryAgentId) {
    process.stdout.write("未获取到 task 入口智能体 ID。\n");
    return;
  }

  process.stdout.write(`${helpText}\n`);
  process.stdout.write(`当前 taskId=${taskId}\n`);
  process.stdout.write(`默认 target=${entryAgentId}\n`);

  const { rl, question } = makeReadline();
  rl.on("SIGINT", () => {
    process.stdout.write("\n已退出。\n");
    rl.close();
  });

  let defaultTarget = entryAgentId;
  while (true) {
    const input = (await question("> ")).trim();
    if (!input) continue;
    const parts = input.split(/\s+/g);
    const cmd = parts[0]?.toLowerCase();
    if (cmd === "exit" || cmd === "quit") {
      system.sendTextToAgent(defaultTarget, "exit", { taskId });
      process.stdout.write("已退出。\n");
      rl.close();
      return;
    }
    if (cmd === "help") {
      process.stdout.write(`${helpText}\n`);
      continue;
    }
    if (cmd === "target") {
      process.stdout.write(`target=${defaultTarget}\n`);
      continue;
    }
    if (cmd === "use") {
      const id = String(parts[1] ?? "").trim();
      if (!id) {
        process.stdout.write("用法：use <agentId>\n");
        continue;
      }
      defaultTarget = id;
      process.stdout.write(`target=${defaultTarget}\n`);
      continue;
    }
    if (cmd === "to") {
      const id = String(parts[1] ?? "").trim();
      const text = parts.slice(2).join(" ").trim();
      if (!id || !text) {
        process.stdout.write("用法：to <agentId> <文本>\n");
        continue;
      }
      system.sendTextToAgent(id, text, { taskId });
      continue;
    }
    system.sendTextToAgent(defaultTarget, input, { taskId });
  }
}

await main();
