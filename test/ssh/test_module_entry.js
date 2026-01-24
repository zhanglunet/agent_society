/**
 * SSH模块入口测试
 * 
 * 测试内容：
 * - 模块加载
 * - init方法
 * - getToolDefinitions方法
 * - executeToolCall方法（参数验证）
 * - shutdown方法
 */

import sshModule from '../../modules/ssh/index.js';

/**
 * 模拟运行时对象
 */
const mockRuntime = {
  log: {
    info: (...args) => console.log('[INFO]', ...args),
    debug: (...args) => console.log('[DEBUG]', ...args),
    error: (...args) => console.error('[ERROR]', ...args)
  },
  config: {
    dataDir: './data'
  }
};

/**
 * 模拟上下文对象
 */
const mockCtx = {
  tools: {
    getArtifact: async (id) => ({ ok: true, content: 'mock content' }),
    putArtifact: async (name, content) => ({ ok: true, artifactId: 'mock-id' })
  }
};

/**
 * 测试模块初始化
 */
async function testInit() {
  console.log('\n=== 测试模块初始化 ===');
  
  const config = {
    maxConnections: 10,
    connectionTimeout: 30000
  };
  
  await sshModule.init(mockRuntime, config);
  console.log('✓ 模块初始化成功');
}

/**
 * 测试获取工具定义
 */
function testGetToolDefinitions() {
  console.log('\n=== 测试获取工具定义 ===');
  
  const tools = sshModule.getToolDefinitions();
  console.log(`✓ 获取到 ${tools.length} 个工具定义`);
  
  // 验证工具定义格式
  const expectedTools = [
    'ssh_list_hosts',
    'ssh_connect',
    'ssh_disconnect',
    'ssh_list_connections',
    'ssh_shell_create',
    'ssh_shell_send',
    'ssh_shell_read',
    'ssh_shell_close',
    'ssh_upload',
    'ssh_download',
    'ssh_transfer_status',
    'ssh_transfer_cancel'
  ];
  
  for (const toolName of expectedTools) {
    const tool = tools.find(t => t.name === toolName);
    if (!tool) {
      throw new Error(`缺少工具定义: ${toolName}`);
    }
  }
  
  console.log('✓ 所有工具定义格式正确');
}

/**
 * 测试参数验证
 */
async function testParameterValidation() {
  console.log('\n=== 测试参数验证 ===');
  
  // 测试缺少必需参数
  const result1 = await sshModule.executeToolCall(mockCtx, 'ssh_connect', {});
  if (result1.error !== 'missing_parameter') {
    throw new Error('参数验证失败：应该返回missing_parameter错误');
  }
  console.log('✓ 缺少必需参数时正确返回错误');
  
  // 测试未知工具
  const result2 = await sshModule.executeToolCall(mockCtx, 'unknown_tool', {});
  if (result2.error !== 'unknown_tool') {
    throw new Error('未知工具验证失败');
  }
  console.log('✓ 未知工具时正确返回错误');
  
  // 测试功能未实现（正常参数）
  const result3 = await sshModule.executeToolCall(mockCtx, 'ssh_connect', { hostName: 'test' });
  if (result3.error !== 'not_implemented') {
    throw new Error('功能未实现验证失败');
  }
  console.log('✓ 功能未实现时正确返回错误');
}

/**
 * 测试模块关闭
 */
async function testShutdown() {
  console.log('\n=== 测试模块关闭 ===');
  
  await sshModule.shutdown();
  console.log('✓ 模块关闭成功');
}

/**
 * 运行所有测试
 */
async function runTests() {
  try {
    console.log('开始测试SSH模块入口...\n');
    
    await testInit();
    testGetToolDefinitions();
    await testParameterValidation();
    await testShutdown();
    
    console.log('\n=== 所有测试通过 ===\n');
    process.exit(0);
  } catch (error) {
    console.error('\n✗ 测试失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 运行测试
runTests();
