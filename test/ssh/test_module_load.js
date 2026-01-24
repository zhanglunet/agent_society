/**
 * SSH模块加载测试
 * 测试模块是否能正常加载和初始化
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../..');

async function testModuleLoad() {
  console.log('=== SSH模块加载测试 ===\n');
  
  try {
    // 1. 测试模块导入
    console.log('1. 测试模块导入...');
    const modulePath = join(projectRoot, 'modules/ssh/index.js');
    // Windows需要使用file://协议
    const moduleUrl = new URL(`file:///${modulePath.replace(/\\/g, '/')}`);
    const module = await import(moduleUrl);
    const sshModule = module.default; // 使用默认导出
    console.log('✓ 模块导入成功');
    console.log('  模块方法:', Object.keys(sshModule));
    
    // 2. 测试模块初始化
    console.log('\n2. 测试模块初始化...');
    const runtime = {
      config: {
        dataDir: join(projectRoot, 'test/.tmp/ssh_test')
      },
      logger: {
        info: (...args) => console.log('[INFO]', ...args),
        error: (...args) => console.error('[ERROR]', ...args),
        warn: (...args) => console.warn('[WARN]', ...args),
        debug: (...args) => console.log('[DEBUG]', ...args)
      }
    };
    
    await sshModule.init(runtime);
    console.log('✓ 模块初始化成功');
    
    // 3. 测试获取工具定义
    console.log('\n3. 测试获取工具定义...');
    const tools = sshModule.getToolDefinitions();
    console.log('✓ 获取工具定义成功');
    console.log(`  工具数量: ${tools.length}`);
    console.log('  工具列表:');
    tools.forEach(tool => {
      console.log(`    - ${tool.name}: ${tool.description}`);
    });
    
    // 4. 测试工具定义格式
    console.log('\n4. 验证工具定义格式...');
    let formatValid = true;
    for (const tool of tools) {
      // 检查必需字段：name, description, parameters
      if (!tool.name || !tool.description || !tool.parameters) {
        console.error(`✗ 工具 ${tool.name} 格式不完整`);
        console.error(`  缺少字段:`, {
          name: !!tool.name,
          description: !!tool.description,
          parameters: !!tool.parameters
        });
        formatValid = false;
      }
    }
    if (formatValid) {
      console.log('✓ 所有工具定义格式正确');
    }
    
    // 5. 测试模块关闭
    console.log('\n5. 测试模块关闭...');
    await sshModule.shutdown();
    console.log('✓ 模块关闭成功');
    
    console.log('\n=== 所有测试通过 ===');
    return true;
    
  } catch (error) {
    console.error('\n✗ 测试失败:', error.message);
    console.error(error.stack);
    return false;
  }
}

// 运行测试
testModuleLoad().then(success => {
  process.exit(success ? 0 : 1);
});
