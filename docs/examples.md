# 示例教程

本文档提供 Agent Society 的详细使用示例和教程。

## 目录

- [示例概览](#示例概览)
- [Demo 1: 简单计算](#demo-1-简单计算)
- [Demo 2: 交互式饭店](#demo-2-交互式饭店)
- [Demo 3: 饭店经营模拟](#demo-3-饭店经营模拟)
- [Dev Team: 自组织编程团队](#dev-team-自组织编程团队)
- [自定义示例](#自定义示例)

## 示例概览

| 示例 | 复杂度 | 说明 |
|------|--------|------|
| Demo 1 | ⭐ | 最简单的使用示例 |
| Demo 2 | ⭐⭐ | 交互式命令行对话 |
| Demo 3 | ⭐⭐⭐ | 完整的自组织场景 |
| Dev Team | ⭐⭐⭐⭐ | 多层级智能体协作 |

## Demo 1: 简单计算

最简单的使用示例，展示基本的需求提交和结果获取。

### 运行

```bash
bun run demo/demo1.js
```

### 代码解析

```javascript
import { AgentSociety } from "../src/platform/agent_society.js";

async function main() {
  // 1. 创建系统实例，指定数据目录
  const system = new AgentSociety({ dataDir: "data/demo1" });
  
  // 2. 初始化系统
  await system.init();

  // 3. 提交需求
  const { taskId } = await system.submitRequirement(
    "计算5+3等于几？回复给我。"
  );

  // 4. 等待回复
  const reply = await system.waitForUserMessage(
    // 匹配条件：同一任务且不是 root 的入口通知
    (m) => m?.taskId === taskId && !(m?.from === "root" && m?.payload?.agentId),
    { timeoutMs: 60000 }
  );

  // 5. 输出结果
  if (reply?.payload?.text) {
    console.log(reply.payload.text);
  }
  
  // 6. 优雅关闭
  await system.shutdown();
}

await main();
```

### 执行流程

```
1. 用户提交需求 "计算5+3等于几？"
        │
        ▼
2. Root 收到需求，创建子智能体
        │
        ▼
3. 子智能体处理计算任务
   - 调用 run_javascript 计算 5+3
   - 得到结果 8
        │
        ▼
4. 子智能体回复用户
   send_message({ to: "user", payload: { text: "5+3=8" } })
        │
        ▼
5. 用户端点收到消息，输出到控制台
```

## Demo 2: 交互式饭店

交互式命令行对话示例，用户可以持续与智能体交互。

### 运行

```bash
bun run demo/demo2.js
```

### 功能

- 查看菜单
- 点餐
- 查看购物车
- 下单
- 结账付款

### 命令

| 命令 | 说明 |
|------|------|
| `help` | 显示帮助 |
| `exit` | 退出 |
| `target` | 查看当前对话目标 |
| `use <id>` | 切换对话目标 |
| `to <id> <文本>` | 向指定智能体发送消息 |
| `menu` | 查看菜单 |
| `order <菜品ID>` | 点餐 |
| `cart` | 查看购物车 |
| `submit` | 确认下单 |
| `bill` | 结账 |

### 代码要点

```javascript
// 构建饭店需求
function buildRestaurantRequirement() {
  return [
    "目标：构建一个可在命令行交互的\"模拟饭店\"",
    "约束：你需要用 create_role / spawn_agent 自组织创建饭店员工智能体",
    "交互：用户会发送短文本命令（menu/order/cart/submit/bill）",
    "数据：内置菜单（至少 6 个菜品）和库存",
    "输出：所有对用户的输出必须 send_message(to=user)",
  ].join("\n");
}

// 等待入口智能体 ID
async function waitForTaskEntryAgentId(system, taskId) {
  const msg = await system.waitForUserMessage(
    (m) => m?.taskId === taskId && m?.from === "root" && m?.payload?.agentId,
    { timeoutMs: 60000 }
  );
  return msg?.payload?.agentId;
}

// 主交互循环
while (true) {
  const input = await question("> ");
  if (input === "exit") break;
  
  // 发送用户输入到智能体
  system.sendTextToAgent(defaultTarget, input, { taskId });
}
```

## Demo 3: 饭店经营模拟

完整的自组织场景，智能体自主创建组织结构并经营饭店。

### 运行

```bash
bun run demo/demo3.js
```

### 特点

- **多层级组织**：游戏规则智能体 → 经理 → 员工
- **经济系统**：初始资金、固定成本、人员工资
- **自主决策**：经理自主组建团队、设计菜单、管理库存

### 游戏规则

| 项目 | 数值 |
|------|------|
| 初始资金 | 50,000 元 |
| 房租 | 500 元/天 |
| 水电 | 100 元/天 |
| 服务员工资 | 80 元/天 |
| 厨师工资 | 120 元/天 |
| 食材成本 | 售价的 30-40% |
| 破产条件 | 资金 < 0 |
| 扩张条件 | 资金 > 100,000 |

### 组织结构演化

```
初始:
  root
    └── game-rules (游戏规则智能体)

游戏规则创建经理:
  root
    └── game-rules
          └── manager (饭店经理)

经理组建团队:
  root
    └── game-rules
          └── manager
                ├── waiter (服务员)
                ├── chef (厨师)
                └── cashier (收银员)
```

### 代码要点

```javascript
// 游戏需求描述
function buildRestaurantGameRequirement() {
  return `
【任务目标】
创建一个"虚拟饭店经营模拟游戏"的游戏规则智能体。

【你的职责 - 游戏规则智能体】
1. 制定并执行游戏规则
2. 创建饭店经理智能体，给予初始预算
3. 监督游戏进程

【游戏规则设定】
1. 初始资金：50000 元
2. 固定成本：房租 500 元/天，水电 100 元/天
3. 人员工资：服务员 80 元/天，厨师 120 元/天
...
  `.trim();
}
```

## Dev Team: 自组织编程团队

最复杂的示例，展示多层级智能体协作完成编程任务。

### 运行

```bash
# 基本用法
bun run demo/dev_team.js

# 指定工作空间和需求
bun run demo/dev_team.js -w ./my_project -r "创建一个计算器程序"

# 查看帮助
bun run demo/dev_team.js --help
```

### 命令行参数

| 参数 | 说明 |
|------|------|
| `-w, --workspace <path>` | 工作空间路径 |
| `-r, --requirement <text>` | 编程需求描述 |
| `-h, --help` | 显示帮助 |

### 组织结构

```
root
  └── architect (架构师)
        ├── programmer-1 (程序员)
        ├── programmer-2 (程序员)
        └── ...
```

### 架构师职责

1. 与用户沟通需求
2. 设计系统架构
3. 将系统分解为子模块
4. 为每个模块创建程序员智能体
5. 收集模块代码，进行集成

### 程序员职责

1. 根据 Task Brief 编写代码
2. 使用 `write_file` 创建代码文件
3. 测试代码功能
4. 向架构师汇报完成情况

### Task Brief 示例

```javascript
spawn_agent({
  roleId: "programmer-xxx",
  taskBrief: {
    objective: "实现计算器的核心运算模块",
    constraints: [
      "使用 JavaScript 实现",
      "纯前端代码，无后端依赖",
      "支持四则运算"
    ],
    inputs: "两个数字和一个运算符",
    outputs: "运算结果",
    completion_criteria: "所有四则运算测试通过"
  }
});
```

### 最佳实践：使用 spawn_agent_with_task

为了减少通信开销，建议使用 `spawn_agent_with_task` 工具，它可以在创建智能体的同时发送第一条任务消息：

```javascript
spawn_agent_with_task({
  roleId: "programmer-xxx",
  taskBrief: {
    // ... 同上 ...
  },
  initialMessage: {
    message_type: "task_assignment",
    task: "请根据 Task Brief 开始编写代码",
    deliverable: "src/calculator.js"
  }
});
```

### 工作流程

```
1. 用户提交编程需求
        │
        ▼
2. Root 创建架构师智能体
        │
        ▼
3. 架构师分析需求，设计架构
        │
        ▼
4. 架构师创建程序员岗位和智能体
   - create_role("programmer", rolePrompt)
   - spawn_agent_with_task(roleId, taskBrief, initialMessage)
        │
        ▼
5. 程序员编写代码
   - write_file("src/module.js", code)
   - run_command("npm test")
        │
        ▼
6. 程序员汇报完成
   - send_message(to=architect, payload={status:"done"})
        │
        ▼
7. 架构师集成代码，交付用户
```

## 自定义示例

### 创建自定义智能体系统

```javascript
import { AgentSociety } from "./src/platform/agent_society.js";

async function main() {
  const system = new AgentSociety({
    dataDir: "data/custom",
    enableHttp: true,
    httpPort: 8080
  });
  
  await system.init();
  
  // 注册消息监听器
  system.onUserMessage((message) => {
    console.log(`[${message.from}] ${message.payload?.text}`);
  });
  
  // 提交自定义需求
  const { taskId } = await system.submitRequirement(`
    你是一个客服助手。
    
    职责：
    1. 回答用户问题
    2. 记录用户反馈
    3. 必要时升级到人工客服
    
    约束：
    - 保持友好专业的态度
    - 不确定的问题要诚实说明
  `);
  
  // 获取入口智能体
  const entryMsg = await system.waitForUserMessage(
    (m) => m?.from === "root" && m?.payload?.agentId,
    { timeoutMs: 60000 }
  );
  
  const agentId = entryMsg?.payload?.agentId;
  console.log(`客服智能体已就绪: ${agentId}`);
  
  // 模拟用户对话
  system.sendTextToAgent(agentId, "你好，我想咨询一下产品价格", { taskId });
}

main();
```

### 带工作空间的编程任务

```javascript
import { AgentSociety } from "./src/platform/agent_society.js";

async function main() {
  const system = new AgentSociety({ dataDir: "data/coding" });
  await system.init();
  
  // 提交编程需求并绑定工作空间
  const result = await system.submitRequirement(
    `
    创建一个 Node.js 项目：
    1. 初始化 package.json
    2. 创建一个简单的 HTTP 服务器
    3. 添加健康检查端点 /health
    4. 编写基本测试
    `,
    { workspacePath: "./my_server" }
  );
  
  if (result.error) {
    console.error("提交失败:", result.error);
    return;
  }
  
  console.log(`任务已提交: ${result.taskId}`);
  console.log(`工作空间: ${result.workspacePath}`);
  
  // 等待完成
  const completion = await system.waitForUserMessage(
    (m) => m?.payload?.text?.includes("完成"),
    { timeoutMs: 300000 }
  );
  
  console.log("任务完成:", completion?.payload?.text);
  
  await system.shutdown();
}

main();
```

### 多任务并行

```javascript
import { AgentSociety } from "./src/platform/agent_society.js";

async function main() {
  const system = new AgentSociety({ dataDir: "data/parallel" });
  await system.init();
  
  // 并行提交多个任务
  const tasks = await Promise.all([
    system.submitRequirement("任务1: 计算 100 的阶乘"),
    system.submitRequirement("任务2: 生成斐波那契数列前 20 项"),
    system.submitRequirement("任务3: 判断 997 是否为质数")
  ]);
  
  console.log("已提交任务:", tasks.map(t => t.taskId));
  
  // 收集所有结果
  const results = await Promise.all(
    tasks.map(({ taskId }) =>
      system.waitForUserMessage(
        (m) => m?.taskId === taskId && m?.payload?.text,
        { timeoutMs: 120000 }
      )
    )
  );
  
  results.forEach((r, i) => {
    console.log(`任务${i + 1} 结果:`, r?.payload?.text);
  });
  
  await system.shutdown();
}

main();
```

## 最佳实践

### 1. 合理设计需求描述

```javascript
// ❌ 不好的需求
"做一个网站"

// ✅ 好的需求
`
创建一个个人博客网站：

功能需求：
1. 首页展示文章列表
2. 文章详情页
3. 关于页面

技术约束：
- 使用 HTML + CSS + JavaScript
- 静态网站，无需后端
- 响应式设计

交付标准：
- 所有页面可正常访问
- 在移动端和桌面端都能正常显示
`
```

### 2. 使用工作空间

```javascript
// 绑定工作空间，让智能体可以操作文件
const { taskId } = await system.submitRequirement(
  requirement,
  { workspacePath: "./project" }
);
```

### 3. 处理超时

```javascript
const reply = await system.waitForUserMessage(
  predicate,
  { timeoutMs: 60000 }
);

if (!reply) {
  console.log("等待超时，可能需要更长时间");
  // 可以继续等待或采取其他措施
}
```

### 4. 监控进度

```javascript
system.onUserMessage((message) => {
  const text = message.payload?.text;
  if (text) {
    console.log(`[${message.from}] ${text}`);
  }
});
```
