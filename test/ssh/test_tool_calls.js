/**
 * SSH工具调用测试
 * 测试工具调用接口（不需要真实SSH服务器）
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../..');

async function testToolCalls() {
  console.log('=== SSH工具调用测试 ===\n');
  
  try {
    // 准备测试环境
    const testDir = join(projectRoot, 'test/.tmp/ssh_tool_test');
    mkdirSync(testDir, { recursive: true });
    
    // 创建测试配置文件
    const configPath = join(projectRoot, 'modules/ssh/config.local.json');
    const testConfig = {
      hosts: [
        {
          name: 'test-server',
          description: '测试服务器',
          host: '127.0.0.1',
          port: 22,
          username: 'testuser',
          password: 'testpass'
        }
      ]
    };
    writeFileSync(configPath, JSON.stringify(testConfig, null, 2));
    console.log('✓ 测试配置文件已创建\n');
    
    // 加载模块
    const modulePath = join(projectRoot, 'modules/ssh/index.js');
    const moduleUrl = new URL(`file:///${modulePath.replace(/\\/g, '/')}`);
    const module = await import(moduleUrl);
    const sshModule = module.default;
    
    // 初始化模块
    const runtime = {
      config: {
        dataDir: testDir
      },
      logger: {
        info: () => {},
        error: (...args) => console.error('[ERROR]', ...args),
        warn: () => {},
        debug: () => {}
      }
    };
    
    await sshModule.init(runtime);
    console.log('✓ 模块已初始化\n');
    
    // 测试1: ssh_list_hosts
    console.log('测试1: ssh_list_hosts');
    try {
      const result = await sshModule.executeToolCall('ssh_list_hosts', {});
      console.log('✓ 调用成功');
      console.log('  返回:', JSON.stringify(result, null, 2));
      
      if (result.hosts && result.hosts.length > 0) {
        console.log('✓ 返回了主机列表');
      } else {
        console.log('✗ 主机列表为空');
      }
    } catch (error) {
      console.log('✗ 调用失败:', error.message);
    }
    
    // 测试2: ssh_connect (预期失败，因为没有真实服务器)
    console.log('\n测试2: ssh_connect (预期失败)');
    try {
      const result = await sshModule.executeToolCall('ssh_connect', {
        hostName: 'test-server'
      });
      console.log('  返回:', JSON.stringify(result, null, 2));
      
      if (result.error) {
        console.log('✓ 正确返回错误信息（无真实服务器）');
      } else {
        console.log('? 意外成功连接');
      }
    } catch (error) {
      console.log('✓ 正确抛出错误（无真实服务器）');
    }
    
    // 测试3: ssh_list_connections
    console.log('\n测试3: ssh_list_connections');
    try {
      const result = await sshModule.executeToolCall('ssh_list_connections', {});
      console.log('✓ 调用成功');
      console.log('  返回:', JSON.stringify(result, null, 2));
      
      if (result.connections && Array.isArray(result.connections)) {
        console.log('✓ 返回了连接列表（应为空）');
      }
    } catch (error) {
      console.log('✗ 调用失败:', error.message);
    }
    
    // 测试4: 无效工具名
    console.log('\n测试4: 调用不存在的工具');
    try {
      const result = await sshModule.executeToolCall('ssh_invalid_tool', {});
      if (result.error) {
        console.log('✓ 正确返回错误信息');
        console.log('  错误:', result.message);
      }
    } catch (error) {
      console.log('✓ 正确抛出错误');
    }
    
    // 测试5: 缺少必需参数
    console.log('\n测试5: 缺少必需参数');
    try {
      const result = await sshModule.executeToolCall('ssh_connect', {});
      if (result.error) {
        console.log('✓ 正确返回错误信息');
        console.log('  错误:', result.message);
      }
    } catch (error) {
      console.log('✓ 正确抛出错误');
    }
    
    // 清理
    await sshModule.shutdown();
    console.log('\n✓ 模块已关闭');
    
    console.log('\n=== 工具调用测试完成 ===');
    return true;
    
  } catch (error) {
    console.error('\n✗ 测试失败:', error.message);
    console.error(error.stack);
    return false;
  }
}

// 运行测试
testToolCalls().then(success => {
  process.exit(success ? 0 : 1);
});
