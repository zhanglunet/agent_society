/**
 * SSH模块 - listHosts功能测试
 * 
 * 测试内容：
 * - 列出已配置的主机
 * - 验证返回格式
 * - 验证不包含敏感信息
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
  tools: {}
};

/**
 * 测试配置（包含主机信息）
 */
const testConfig = {
  maxConnections: 10,
  connectionTimeout: 30000,
  hosts: {
    'test-server-1': {
      description: '测试服务器1',
      host: '192.168.1.100',
      port: 22,
      username: 'root',
      password: 'secret123'
    },
    'test-server-2': {
      description: '测试服务器2',
      host: '192.168.1.101',
      port: 2222,
      username: 'admin',
      privateKey: '/path/to/key'
    },
    'test-server-3': {
      description: '测试服务器3（无描述测试）',
      host: '192.168.1.102',
      port: 22,
      username: 'user'
    }
  }
};

/**
 * 测试空配置
 */
async function testEmptyConfig() {
  console.log('\n=== 测试空配置 ===');
  
  // 初始化模块（空配置）
  await sshModule.init(mockRuntime, {});
  
  // 调用listHosts
  const result = await sshModule.executeToolCall(mockCtx, 'ssh_list_hosts', {});
  
  // 验证结果
  if (!result.ok) {
    throw new Error('空配置时应该返回ok: true');
  }
  
  if (!Array.isArray(result.hosts)) {
    throw new Error('返回的hosts应该是数组');
  }
  
  if (result.hosts.length !== 0) {
    throw new Error('空配置时应该返回空数组');
  }
  
  console.log('✓ 空配置测试通过');
  
  await sshModule.shutdown();
}

/**
 * 测试正常配置
 */
async function testNormalConfig() {
  console.log('\n=== 测试正常配置 ===');
  
  // 初始化模块（包含主机配置）
  await sshModule.init(mockRuntime, testConfig);
  
  // 调用listHosts
  const result = await sshModule.executeToolCall(mockCtx, 'ssh_list_hosts', {});
  
  // 验证结果
  if (!result.ok) {
    throw new Error('应该返回ok: true');
  }
  
  if (!Array.isArray(result.hosts)) {
    throw new Error('返回的hosts应该是数组');
  }
  
  if (result.hosts.length !== 3) {
    throw new Error(`应该返回3个主机，实际返回${result.hosts.length}个`);
  }
  
  console.log(`✓ 返回了${result.hosts.length}个主机`);
  
  // 验证每个主机的格式
  for (const host of result.hosts) {
    if (!host.hostName) {
      throw new Error('主机应该包含hostName字段');
    }
    
    if (!host.description) {
      throw new Error('主机应该包含description字段');
    }
    
    // 验证不包含敏感信息
    if (host.host || host.port || host.username || host.password || host.privateKey) {
      throw new Error('主机信息不应该包含敏感信息（host、port、username、password、privateKey）');
    }
    
    console.log(`  - ${host.hostName}: ${host.description}`);
  }
  
  console.log('✓ 所有主机格式正确，不包含敏感信息');
  
  // 验证特定主机
  const server1 = result.hosts.find(h => h.hostName === 'test-server-1');
  if (!server1) {
    throw new Error('应该包含test-server-1');
  }
  
  if (server1.description !== '测试服务器1') {
    throw new Error('test-server-1的描述不正确');
  }
  
  console.log('✓ 主机信息验证通过');
  
  await sshModule.shutdown();
}

/**
 * 运行所有测试
 */
async function runTests() {
  try {
    console.log('开始测试SSH模块 - listHosts功能...\n');
    
    await testEmptyConfig();
    await testNormalConfig();
    
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
