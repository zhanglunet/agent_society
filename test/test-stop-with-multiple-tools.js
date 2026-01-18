/**
 * 测试在多个工具调用执行期间停止智能体
 * 
 * 模拟真实场景：
 * 1. LLM 返回包含多个工具调用的响应
 * 2. 第一个工具调用开始执行
 * 3. 在第一个工具调用执行期间，用户点击停止按钮
 * 4. 验证后续的工具调用不会被执行
 */

import { Runtime } from "../src/platform/runtime.js";
import { AgentSociety } from "../src/platform/agent_society.js";
import { Config } from "../src/platform/utils/config/config.js";

async function testStopWithMultipleTools() {
  console.log("=== 测试多个工具调用期间的停止功能 ===\n");
  
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
  
  // 创建测试智能体
  const agent = await runtime.spawnAgent({
    roleId: "test-role",
    parentAgentId: "root"
  });
  
  console.log(`创建智能体: ${agent.id}\n`);
  
  // 跟踪工具调用执行情况
  const executedTools = [];
  let stopTriggered = false;
  
  // 模拟工具调用
  const originalExecuteToolCall = runtime.executeToolCall.bind(runtime);
  
  runtime.executeToolCall = async function(ctx, toolName, args) {
    console.log(`工具调用开始: ${toolName}`);
    
    // 检查状态
    const status = runtime.getAgentComputeStatus(agent.id);
    console.log(`  当前状态: ${status}`);
    
    if (status === 'stopped' || status === 'stopping' || status === 'terminating') {
      console.log(`  ✓ 工具调用被阻止（状态: ${status}）`);
      throw new Error("Agent stopped");
    }
    
    // 模拟第一个工具调用执行时触发停止
    if (executedTools.length === 0 && !stopTriggered) {
      console.log(`  在第一个工具执行期间触发停止...`);
      stopTriggered = true;
      
      // 异步触发停止操作（模拟用户点击停止按钮）
      setTimeout(async () => {
        console.log(`  [异步] 执行停止操作...`);
        const stopResult = await runtime.abortAgentLlmCall(agent.id);
        console.log(`  [异步] 停止结果: ok=${stopResult.ok}`);
      }, 10);
      
      // 模拟工具执行需要一些时间
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    executedTools.push(toolName);
    console.log(`  工具执行完成: ${toolName}`);
    
    return await originalExecuteToolCall(ctx, toolName, args);
  };
  
  // 模拟 LLM 返回多个工具调用的场景
  console.log("模拟场景：LLM 返回 3 个工具调用\n");
  
  // 创建模拟的上下文
  const ctx = {
    agent: agent,
    runtime: runtime,
    tools: runtime._buildAgentContext().tools,
    currentMessage: { id: "test-msg", taskId: "test-task" }
  };
  
  // 模拟对话历史
  const conv = [
    { role: "system", content: "You are a test agent" },
    { role: "user", content: "Execute three tools" }
  ];
  
  // 模拟 LLM 响应（包含 3 个工具调用）
  const mockLlmResponse = {
    role: "assistant",
    content: null,
    tool_calls: [
      {
        id: "call_1",
        type: "function",
        function: {
          name: "tool_1",
          arguments: JSON.stringify({})
        }
      },
      {
        id: "call_2",
        type: "function",
        function: {
          name: "tool_2",
          arguments: JSON.stringify({})
        }
      },
      {
        id: "call_3",
        type: "function",
        function: {
          name: "tool_3",
          arguments: JSON.stringify({})
        }
      }
    ]
  };
  
  // 设置智能体为 processing 状态
  runtime.setAgentComputeStatus(agent.id, "processing");
  
  // 模拟工具调用执行循环（简化版的 _doLlmProcessing 逻辑）
  try {
    for (const call of mockLlmResponse.tool_calls) {
      // 在执行每个工具调用前检查状态（这是我们添加的修复）
      const statusBeforeTool = runtime.getAgentComputeStatus(agent.id);
      if (statusBeforeTool === 'stopped' || statusBeforeTool === 'stopping' || statusBeforeTool === 'terminating') {
        console.log(`\n智能体已停止，跳过剩余工具调用`);
        console.log(`  状态: ${statusBeforeTool}`);
        console.log(`  已执行: ${executedTools.length} 个工具`);
        console.log(`  剩余: ${mockLlmResponse.tool_calls.length - executedTools.length} 个工具\n`);
        break;
      }
      
      const toolName = call.function.name;
      const args = JSON.parse(call.function.arguments);
      
      try {
        await runtime.executeToolCall(ctx, toolName, args);
      } catch (err) {
        console.log(`  工具执行失败: ${err.message}`);
      }
      
      // 在工具执行后再次检查状态（这是我们添加的修复）
      const statusAfterTool = runtime.getAgentComputeStatus(agent.id);
      if (statusAfterTool === 'stopped' || statusAfterTool === 'stopping' || statusAfterTool === 'terminating') {
        console.log(`\n智能体在工具执行后已停止，跳过剩余工具调用`);
        console.log(`  状态: ${statusAfterTool}`);
        console.log(`  已执行: ${executedTools.length} 个工具`);
        console.log(`  剩余: ${mockLlmResponse.tool_calls.length - executedTools.length} 个工具\n`);
        break;
      }
    }
  } catch (err) {
    console.log(`\n工具调用循环异常: ${err.message}\n`);
  }
  
  // 等待异步停止操作完成
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // 验证结果
  console.log("=== 验证结果 ===");
  console.log(`执行的工具数量: ${executedTools.length}`);
  console.log(`执行的工具: ${executedTools.join(", ")}`);
  console.log(`最终状态: ${runtime.getAgentComputeStatus(agent.id)}`);
  
  const finalStatus = runtime.getAgentComputeStatus(agent.id);
  
  if (finalStatus !== "stopped") {
    console.error(`\n✗ 失败: 期望状态为 stopped，实际为 ${finalStatus}`);
    return false;
  }
  
  if (executedTools.length >= 3) {
    console.error(`\n✗ 失败: 不应该执行所有 3 个工具调用`);
    console.error(`  实际执行了 ${executedTools.length} 个工具`);
    return false;
  }
  
  if (executedTools.length === 0) {
    console.error(`\n✗ 失败: 至少应该执行第一个工具调用`);
    return false;
  }
  
  console.log(`\n✓ 通过: 智能体被正确停止，只执行了 ${executedTools.length} 个工具，剩余 ${3 - executedTools.length} 个工具未执行\n`);
  
  // 恢复原始方法
  runtime.executeToolCall = originalExecuteToolCall;
  
  console.log("=== 测试通过 ===\n");
  
  // 清理
  await runtime.shutdown();
  
  return true;
}

// 运行测试
testStopWithMultipleTools()
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
    console.error(err.stack);
    process.exit(1);
  });
