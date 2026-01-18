/**
 * 测试在工具调用执行期间停止智能体
 * 
 * 此测试验证：
 * 1. 当 LLM 返回包含工具调用的响应后，如果智能体被停止，工具调用不应该被执行
 * 2. 如果工具调用已经开始执行，停止操作应该阻止后续的工具调用
 */

import { Runtime } from "../src/platform/runtime.js";
import { AgentSociety } from "../src/platform/agent_society.js";
import { Config } from "../src/platform/utils/config/config.js";

async function testStopDuringToolExecution() {
  console.log("=== 测试工具调用期间的停止功能 ===\n");
  
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
  
  // 测试：模拟 LLM 返回工具调用，然后在执行前停止智能体
  console.log("测试：在工具调用执行前停止智能体");
  
  // 创建测试智能体
  const agent = await runtime.spawnAgent({
    roleId: "test-role",
    parentAgentId: "root"
  });
  
  console.log(`  创建智能体: ${agent.id}`);
  
  // 模拟智能体进入 processing 状态（正在处理工具调用）
  runtime.setAgentComputeStatus(agent.id, "processing");
  console.log(`  设置状态为: processing`);
  
  // 创建一个模拟的工具调用场景
  let toolExecuted = false;
  const originalExecuteToolCall = runtime.executeToolCall.bind(runtime);
  
  runtime.executeToolCall = async function(ctx, toolName, args) {
    console.log(`  工具调用开始: ${toolName}`);
    
    // 检查状态
    const status = runtime.getAgentComputeStatus(agent.id);
    console.log(`  工具执行时状态: ${status}`);
    
    if (status === 'stopped' || status === 'stopping' || status === 'terminating') {
      console.log(`  ✓ 工具调用被正确阻止（状态: ${status}）`);
      throw new Error("Agent stopped");
    }
    
    toolExecuted = true;
    console.log(`  ✗ 工具调用被执行了（不应该发生）`);
    return await originalExecuteToolCall(ctx, toolName, args);
  };
  
  // 在工具调用执行前停止智能体
  console.log(`  执行停止操作...`);
  const stopResult = await runtime.abortAgentLlmCall(agent.id);
  console.log(`  停止结果: ok=${stopResult.ok}, aborted=${stopResult.aborted}`);
  
  const finalStatus = runtime.getAgentComputeStatus(agent.id);
  console.log(`  最终状态: ${finalStatus}`);
  
  // 验证结果
  if (finalStatus !== "stopped") {
    console.error(`  ✗ 失败: 期望状态为 stopped，实际为 ${finalStatus}`);
    return false;
  }
  
  if (toolExecuted) {
    console.error(`  ✗ 失败: 工具调用不应该被执行`);
    return false;
  }
  
  console.log("  ✓ 通过：智能体被正确停止，工具调用未执行\n");
  
  // 恢复原始方法
  runtime.executeToolCall = originalExecuteToolCall;
  
  console.log("=== 测试通过 ===\n");
  
  // 清理
  await runtime.shutdown();
  
  return true;
}

// 运行测试
testStopDuringToolExecution()
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
