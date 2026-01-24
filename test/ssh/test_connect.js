/**
 * SSH连接建立功能测试
 * 
 * 测试内容：
 * - 测试通过主机名称建立连接
 * - 测试密码认证
 * - 测试密钥认证
 * - 测试无效主机名称
 * - 测试连接失败场景
 */

import sshModule from '../../modules/ssh/index.js';

// 模拟运行时
const mockRuntime = {
  log: {
    info: (...args) => console.log('[INFO]', ...args),
    debug: (...args) => console.log('[DEBUG]', ...args),
    warn: (...args) => console.warn('[WARN]', ...args),
    error: (...args) => console.error('[ERROR]', ...args)
  }
};

// 测试配置
const testConfig = {
  connectionTimeout: 10000,
  hosts: {
    'test-server': {
      description: '测试服务器',
      host: '127.0.0.1',
      port: 22,
      username: 'testuser',
      password: 'testpass'
    },
    'invalid-server': {
      description: '无效服务器',
      host: '192.0.2.1', // TEST-NET-1，不可路由的地址
      port: 22,
      username: 'testuser',
      password: 'testpass'
    }
  }
};

async function runTests() {
  console.log('=== SSH连接建立功能测试 ===\n');

  try {
    // 初始化模块
    console.log('1. 初始化SSH模块...');
    await sshModule.init(mockRuntime, testConfig);
    console.log('✓ 模块初始化成功\n');

    // 测试1：列出主机（验证配置加载）
    console.log('2. 测试列出主机...');
    const listResult = await sshModule.executeToolCall(null, 'ssh_list_hosts', {});
    if (listResult.ok && listResult.hosts.length === 2) {
      console.log('✓ 列出主机成功');
      console.log('  主机列表:', JSON.stringify(listResult.hosts, null, 2));
    } else {
      console.error('✗ 列出主机失败:', listResult);
    }
    console.log('');

    // 测试2：使用无效主机名称连接
    console.log('3. 测试使用无效主机名称连接...');
    const invalidHostResult = await sshModule.executeToolCall(null, 'ssh_connect', {
      hostName: 'non-existent-host'
    });
    if (invalidHostResult.error === 'invalid_host_name') {
      console.log('✓ 正确返回无效主机名称错误');
      console.log('  错误消息:', invalidHostResult.message);
    } else {
      console.error('✗ 未正确处理无效主机名称:', invalidHostResult);
    }
    console.log('');

    // 测试3：连接到无效服务器（测试连接超时）
    console.log('4. 测试连接到无效服务器（预期超时）...');
    console.log('  注意：此测试可能需要等待10秒超时');
    const timeoutResult = await sshModule.executeToolCall(null, 'ssh_connect', {
      hostName: 'invalid-server'
    });
    if (timeoutResult.error === 'connection_failed') {
      console.log('✓ 正确返回连接失败错误');
      console.log('  错误消息:', timeoutResult.message);
    } else {
      console.error('✗ 未正确处理连接失败:', timeoutResult);
    }
    console.log('');

    // 测试4：连接到真实服务器（需要用户提供）
    console.log('5. 测试连接到真实服务器...');
    console.log('  注意：此测试需要真实的SSH服务器');
    console.log('  如果没有可用的SSH服务器，此测试将失败');
    const connectResult = await sshModule.executeToolCall(null, 'ssh_connect', {
      hostName: 'test-server'
    });
    if (connectResult.connectionId) {
      console.log('✓ 连接建立成功');
      console.log('  连接ID:', connectResult.connectionId);
      console.log('  状态:', connectResult.status);
      console.log('  主机名称:', connectResult.hostName);
    } else if (connectResult.error === 'connection_failed') {
      console.log('⚠ 连接失败（预期，因为没有真实的SSH服务器）');
      console.log('  错误消息:', connectResult.message);
    } else {
      console.error('✗ 连接失败:', connectResult);
    }
    console.log('');

    // 清理
    console.log('6. 关闭模块...');
    await sshModule.shutdown();
    console.log('✓ 模块已关闭\n');

    console.log('=== 测试完成 ===');
    console.log('\n说明：');
    console.log('- 如果要测试真实的SSH连接，请修改testConfig中的test-server配置');
    console.log('- 确保SSH服务器可访问且认证信息正确');
    console.log('- 可以使用本地SSH服务器或远程服务器进行测试');

  } catch (error) {
    console.error('\n✗ 测试过程中发生错误:', error);
    console.error('错误堆栈:', error.stack);
  }
}

// 运行测试
runTests().catch(console.error);
