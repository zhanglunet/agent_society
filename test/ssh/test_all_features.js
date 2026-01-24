/**
 * SSH模块综合功能测试
 * 
 * 测试内容：
 * - 连接管理（列出主机、建立连接、列出连接、断开连接）
 * - Shell会话（创建会话、发送命令、读取输出、关闭会话）
 * - 文件传输（上传、下载、查询状态、取消任务）
 * 
 * 注意：此测试需要真实的SSH服务器才能完整运行
 */

import sshModule from '../../modules/ssh/index.js';

// 模拟运行时
const mockRuntime = {
  log: {
    info: (...args) => console.log('[INFO]', ...args),
    debug: (...args) => console.log('[DEBUG]', ...args),
    warn: (...args) => console.warn('[WARN]', ...args),
    error: (...args) => console.error('[ERROR]', ...args)
  },
  config: {
    dataDir: './test/.tmp/ssh_test'
  }
};

// 模拟上下文（用于文件传输）
const mockCtx = {
  tools: {
    async getArtifact(artifactId) {
      // 模拟获取工件内容
      return `Test file content for artifact ${artifactId}`;
    },
    async putArtifact(fileName, content) {
      // 模拟保存工件
      const artifactId = `artifact_${Date.now()}`;
      console.log(`[MOCK] 保存工件: ${fileName} -> ${artifactId}`);
      return artifactId;
    }
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
    }
  }
};

/**
 * 延迟函数
 * @param {number} ms - 延迟毫秒数
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('=== SSH模块综合功能测试 ===\n');

  try {
    // 初始化模块
    console.log('1. 初始化SSH模块...');
    await sshModule.init(mockRuntime, testConfig);
    console.log('✓ 模块初始化成功\n');

    // ========== 连接管理测试 ==========
    console.log('========== 连接管理测试 ==========\n');

    // 测试1：列出主机
    console.log('2. 测试列出主机...');
    const listHostsResult = await sshModule.executeToolCall(null, 'ssh_list_hosts', {});
    if (listHostsResult.ok) {
      console.log('✓ 列出主机成功');
      console.log('  主机列表:', JSON.stringify(listHostsResult.hosts, null, 2));
    } else {
      console.error('✗ 列出主机失败:', listHostsResult);
    }
    console.log('');

    // 测试2：建立连接
    console.log('3. 测试建立连接...');
    console.log('  注意：此测试需要真实的SSH服务器');
    const connectResult = await sshModule.executeToolCall(null, 'ssh_connect', {
      hostName: 'test-server'
    });
    
    let connectionId = null;
    if (connectResult.connectionId) {
      connectionId = connectResult.connectionId;
      console.log('✓ 连接建立成功');
      console.log('  连接ID:', connectionId);
    } else if (connectResult.error === 'connection_failed') {
      console.log('⚠ 连接失败（预期，因为没有真实的SSH服务器）');
      console.log('  错误消息:', connectResult.message);
      console.log('\n后续测试需要真实的SSH连接，跳过...\n');
      
      // 清理并退出
      await sshModule.shutdown();
      console.log('=== 测试完成（部分） ===');
      return;
    } else {
      console.error('✗ 连接失败:', connectResult);
      await sshModule.shutdown();
      return;
    }
    console.log('');

    // 测试3：列出连接
    console.log('4. 测试列出连接...');
    const listConnectionsResult = await sshModule.executeToolCall(null, 'ssh_list_connections', {});
    if (listConnectionsResult.ok) {
      console.log('✓ 列出连接成功');
      console.log('  连接数量:', listConnectionsResult.connections.length);
    } else {
      console.error('✗ 列出连接失败:', listConnectionsResult);
    }
    console.log('');

    // ========== Shell会话测试 ==========
    console.log('========== Shell会话测试 ==========\n');

    // 测试4：创建Shell会话
    console.log('5. 测试创建Shell会话...');
    const createShellResult = await sshModule.executeToolCall(null, 'ssh_shell_create', {
      connectionId
    });
    
    let shellId = null;
    if (createShellResult.shellId) {
      shellId = createShellResult.shellId;
      console.log('✓ Shell会话创建成功');
      console.log('  会话ID:', shellId);
      console.log('  输出文件:', createShellResult.outputFile);
    } else {
      console.error('✗ Shell会话创建失败:', createShellResult);
    }
    console.log('');

    if (shellId) {
      // 测试5：发送命令
      console.log('6. 测试发送命令...');
      const sendCommandResult = await sshModule.executeToolCall(null, 'ssh_shell_send', {
        shellId,
        command: 'echo "Hello SSH"'
      });
      
      if (sendCommandResult.ok) {
        console.log('✓ 命令发送成功');
      } else {
        console.error('✗ 命令发送失败:', sendCommandResult);
      }
      console.log('');

      // 等待命令执行
      console.log('7. 等待命令执行（2秒）...');
      await delay(2000);
      console.log('');

      // 测试6：读取输出
      console.log('8. 测试读取输出...');
      const readOutputResult = await sshModule.executeToolCall(null, 'ssh_shell_read', {
        shellId,
        offset: 0
      });
      
      if (readOutputResult.output !== undefined) {
        console.log('✓ 输出读取成功');
        console.log('  输出内容:', readOutputResult.output.substring(0, 200));
        console.log('  当前偏移:', readOutputResult.offset);
        console.log('  文件总长度:', readOutputResult.totalLength);
      } else {
        console.error('✗ 输出读取失败:', readOutputResult);
      }
      console.log('');

      // 测试7：关闭Shell会话
      console.log('9. 测试关闭Shell会话...');
      const closeShellResult = await sshModule.executeToolCall(null, 'ssh_shell_close', {
        shellId
      });
      
      if (closeShellResult.ok) {
        console.log('✓ Shell会话关闭成功');
      } else {
        console.error('✗ Shell会话关闭失败:', closeShellResult);
      }
      console.log('');
    }

    // ========== 文件传输测试 ==========
    console.log('========== 文件传输测试 ==========\n');

    // 测试8：上传文件
    console.log('10. 测试上传文件...');
    const uploadResult = await sshModule.executeToolCall(mockCtx, 'ssh_upload', {
      connectionId,
      artifactId: 'test_artifact_123',
      remotePath: '/tmp/test_upload.txt'
    });
    
    let uploadTaskId = null;
    if (uploadResult.taskId) {
      uploadTaskId = uploadResult.taskId;
      console.log('✓ 上传任务创建成功');
      console.log('  任务ID:', uploadTaskId);
      console.log('  文件大小:', uploadResult.fileSize);
      console.log('  状态:', uploadResult.status);
    } else {
      console.error('✗ 上传任务创建失败:', uploadResult);
    }
    console.log('');

    if (uploadTaskId) {
      // 测试9：查询上传状态
      console.log('11. 测试查询上传状态...');
      await delay(1000); // 等待1秒
      
      const uploadStatusResult = await sshModule.executeToolCall(null, 'ssh_transfer_status', {
        taskId: uploadTaskId
      });
      
      if (uploadStatusResult.status) {
        console.log('✓ 查询上传状态成功');
        console.log('  状态:', uploadStatusResult.status);
        console.log('  进度:', uploadStatusResult.progress + '%');
        console.log('  已传输:', uploadStatusResult.bytesTransferred);
        console.log('  总大小:', uploadStatusResult.totalBytes);
      } else {
        console.error('✗ 查询上传状态失败:', uploadStatusResult);
      }
      console.log('');
    }

    // 测试10：下载文件
    console.log('12. 测试下载文件...');
    const downloadResult = await sshModule.executeToolCall(mockCtx, 'ssh_download', {
      connectionId,
      remotePath: '/tmp/test_download.txt',
      fileName: 'downloaded_file.txt'
    });
    
    let downloadTaskId = null;
    if (downloadResult.taskId) {
      downloadTaskId = downloadResult.taskId;
      console.log('✓ 下载任务创建成功');
      console.log('  任务ID:', downloadTaskId);
      console.log('  文件大小:', downloadResult.fileSize);
      console.log('  状态:', downloadResult.status);
    } else {
      console.error('✗ 下载任务创建失败:', downloadResult);
    }
    console.log('');

    if (downloadTaskId) {
      // 测试11：取消下载
      console.log('13. 测试取消下载...');
      const cancelResult = await sshModule.executeToolCall(null, 'ssh_transfer_cancel', {
        taskId: downloadTaskId
      });
      
      if (cancelResult.ok) {
        console.log('✓ 下载任务取消成功');
      } else {
        console.error('✗ 下载任务取消失败:', cancelResult);
      }
      console.log('');
    }

    // ========== 清理测试 ==========
    console.log('========== 清理测试 ==========\n');

    // 测试12：断开连接
    console.log('14. 测试断开连接...');
    const disconnectResult = await sshModule.executeToolCall(null, 'ssh_disconnect', {
      connectionId
    });
    
    if (disconnectResult.ok) {
      console.log('✓ 连接断开成功');
    } else {
      console.error('✗ 连接断开失败:', disconnectResult);
    }
    console.log('');

    // 关闭模块
    console.log('15. 关闭模块...');
    await sshModule.shutdown();
    console.log('✓ 模块已关闭\n');

    console.log('=== 测试完成 ===');
    console.log('\n说明：');
    console.log('- 如果要测试真实的SSH功能，请修改testConfig中的test-server配置');
    console.log('- 确保SSH服务器可访问且认证信息正确');
    console.log('- 文件传输测试需要远程服务器上有相应的文件路径权限');

  } catch (error) {
    console.error('\n✗ 测试过程中发生错误:', error);
    console.error('错误堆栈:', error.stack);
    
    // 确保清理
    try {
      await sshModule.shutdown();
    } catch (e) {
      // 忽略清理错误
    }
  }
}

// 运行测试
runTests().catch(console.error);
