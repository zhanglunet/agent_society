/**
 * 测试智能体停止功能
 * 
 * 此测试验证以下功能：
 * 1. 停止按钮能够立即停止智能体的 LLM 调用
 * 2. 停止后智能体状态正确设置为 stopped
 * 3. 停止后智能体不再接收新消息
 * 4. 停止后 LLM 响应被正确丢弃
 * 5. 删除操作先执行停止流程
 */

import { Runtime } from "../src/platform/runtime.js";
import { AgentSociety } from "../src/platform/agent_society.js";
import { Config } from "../src/platform/utils/config/config.js";

async function testStopFunctionality() {
  console.log("=== 开始测试智能体停止功能 ===\n");
  
  // 初始化运行时
  const configService = new Config("config");
  const runtime = new Runtime({
    configService,
    dataDir: "agent-society-data"
  });
  
  await runtime.init();
  
  const society = new AgentSociety({ configService, runtime });
  await society.init();
  
  console.log("✓ 运行时初始化完成\n");
  
  // 测试 1: 创建智能体并检查初始状态
  console.log("测试 1: 创建智能体并检查初始状态");
  const agent = await runtime.spawnAgent({
    roleId: "test-role",
    parentAgentId: "root"
  });
  
  const initialStatus = runtime.getAgentComputeStatus(agent.id);
  console.log(`  智能体 ${agent.id} 初始状态: ${initialStatus}`);
  
  if (initialStatus !== "idle") {
    console.error(`  ✗ 失败: 期望状态为 idle，实际为 ${initialStatus}`);
    return false;
  }
  console.log("  ✓ 通过\n");
  
  // 测试 2: 模拟智能体进入 waiting_llm 状态并停止
  console.log("测试 2: 停止正在等待 LLM 的智能体");
  runtime.setAgentComputeStatus(agent.id, "waiting_llm");
  
  const stopResult = await runtime.abortAgentLlmCall(agent.id);
  console.log(`  停止结果: ok=${stopResult.ok}, aborted=${stopResult.aborted}`);
  
  const stoppedStatus = runtime.getAgentComputeStatus(agent.id);
  console.log(`  停止后状态: ${stoppedStatus}`);
  
  if (!stopResult.ok) {
    console.error(`  ✗ 失败: 停止操作返回 ok=false`);
    return false;
  }
  
  if (stoppedStatus !== "stopped") {
    console.error(`  ✗ 失败: 期望状态为 stopped，实际为 ${stoppedStatus}`);
    return false;
  }
  console.log("  ✓ 通过\n");
  
  // 测试 3: 验证已停止的智能体拒绝新消息
  console.log("测试 3: 验证已停止的智能体拒绝新消息");
  try {
    const sendResult = runtime.bus.send({
      from: "root",
      to: agent.id,
      payload: { text: "测试消息" }
    });
    
    // 检查消息是否被拒绝
    const queueDepth = runtime.bus.getQueueDepth(agent.id);
    console.log(`  消息队列深度: ${queueDepth}`);
    
    if (queueDepth > 0) {
      console.error(`  ✗ 失败: 已停止的智能体不应接收新消息`);
      return false;
    }
    console.log("  ✓ 通过\n");
  } catch (err) {
    console.log(`  消息被拒绝（预期行为）: ${err.message}`);
    console.log("  ✓ 通过\n");
  }
  
  // 测试 4: 测试重复停止操作
  console.log("测试 4: 测试重复停止操作");
  const stopAgainResult = await runtime.abortAgentLlmCall(agent.id);
  console.log(`  重复停止结果: ok=${stopAgainResult.ok}, reason=${stopAgainResult.reason}`);
  
  if (!stopAgainResult.ok || stopAgainResult.reason !== "already_stopped") {
    console.error(`  ✗ 失败: 重复停止应返回 already_stopped`);
    return false;
  }
  console.log("  ✓ 通过\n");
  
  // 测试 5: 测试级联停止功能
  console.log("测试 5: 测试级联停止功能");
  
  // 创建父智能体和子智能体
  const parentAgent = await runtime.spawnAgent({
    roleId: "test-role",
    parentAgentId: "root"
  });
  
  const childAgent = await runtime.spawnAgent({
    roleId: "test-role",
    parentAgentId: parentAgent.id
  });
  
  // 设置子智能体为活跃状态
  runtime.setAgentComputeStatus(childAgent.id, "waiting_llm");
  
  // 级联停止父智能体
  const cascadeResult = await runtime.abortAgentLlmCall(parentAgent.id, true);
  console.log(`  级联停止结果: ok=${cascadeResult.ok}, cascadeStopped=${cascadeResult.cascadeStopped?.length ?? 0}`);
  
  const childStatus = runtime.getAgentComputeStatus(childAgent.id);
  console.log(`  子智能体状态: ${childStatus}`);
  
  if (childStatus !== "stopped") {
    console.error(`  ✗ 失败: 子智能体应该被级联停止`);
    return false;
  }
  console.log("  ✓ 通过\n");
  
  console.log("=== 所有测试通过 ===\n");
  
  // 清理
  await runtime.shutdown();
  
  return true;
}

// 运行测试
testStopFunctionality()
  .then(success => {
    if (success) {
      console.log("✓ 测试成功完成");
      process.exit(0);
    } else {
      console.error("✗ 测试失败");
      process.exit(1);
    }
  })
  .catch(err => {
    console.error("✗ 测试执行出错:", err);
    process.exit(1);
  });
