/**
 * Shell会话管理器
 * 
 * 职责：
 * - 创建和管理交互式shell会话
 * - 异步接收会话输出并保存到本地文件
 * - 提供文件偏移读取功能（窗口大小5000字符）
 * - 处理并发读写，避免冲突
 * - 会话生命周期管理
 * 
 * 设计说明：
 * - 使用Map存储会话池，key为shellId，value为会话对象
 * - 输出文件存储在{dataDir}/ssh/目录
 * - 文件命名格式：YYYYMMDD-HHmmss-hostname.log
 * - 持续监听shell输出流，追加到文件
 * - 读取使用独立的文件描述符，避免与写入冲突
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

/**
 * Shell会话管理器类
 */
class ShellManager {
  /**
   * 构造函数
   * @param {Object} connectionManager - 连接管理器实例
   * @param {Object} runtime - 运行时实例
   * @param {Object} log - 日志对象
   */
  constructor(connectionManager, runtime, log) {
    this.connectionManager = connectionManager;
    this.runtime = runtime;
    this.log = log || console;
    this.shells = new Map(); // shellId -> shell对象
    this.windowSize = 5000; // 窗口大小（字符）
    this.shellCounter = 0; // 会话计数器，用于生成会话ID
    
    // 确保输出目录存在
    this._ensureOutputDir();
  }

  /**
   * 确保输出目录存在
   * @private
   */
  async _ensureOutputDir() {
    try {
      const dataDir = this.runtime?.config?.dataDir || './data';
      const outputDir = path.join(dataDir, 'ssh');
      await fsp.mkdir(outputDir, { recursive: true });
      this.outputDir = outputDir;
      this.log.debug?.('[ShellManager] 输出目录已创建', { outputDir });
    } catch (error) {
      this.log.error?.('[ShellManager] 创建输出目录失败', {
        error: error.message,
        stack: error.stack
      });
      // 使用默认目录
      this.outputDir = './data/ssh';
    }
  }

  /**
   * 生成唯一的会话ID
   * @returns {string} 会话ID，格式：shell_时间戳_计数器
   * @private
   */
  _generateShellId() {
    this.shellCounter++;
    return `shell_${Date.now()}_${this.shellCounter}`;
  }

  /**
   * 生成输出文件路径
   * @param {string} hostName - 主机名称
   * @returns {string} 输出文件路径
   * @private
   */
  _generateOutputFilePath(hostName) {
    const timestamp = new Date().toISOString()
      .replace(/:/g, '')
      .replace(/\..+/, '')
      .replace('T', '-');
    const fileName = `${timestamp}-${hostName}.log`;
    return path.join(this.outputDir, fileName);
  }

  /**
   * 创建shell会话
   * 
   * 设计说明：
   * - 从ConnectionManager获取连接实例
   * - 创建shell流
   * - 生成输出文件路径
   * - 启动后台监听，持续接收输出并追加到文件
   * - 返回会话ID
   * 
   * @param {string} connectionId - 连接ID
   * @returns {Promise<Object>} {shellId} 或 {error, message}
   */
  async createShell(connectionId) {
    try {
      this.log.debug?.('[ShellManager] 开始创建shell会话', { connectionId });

      // 1. 获取连接实例
      const connResult = this.connectionManager.getConnection(connectionId);
      if (connResult.error) {
        return connResult;
      }

      const connection = connResult.connection;
      const client = connection.client;

      // 2. 生成会话ID和输出文件路径
      const shellId = this._generateShellId();
      const outputFile = this._generateOutputFilePath(connection.hostName);

      // 3. 创建shell流
      const shellPromise = new Promise((resolve, reject) => {
        client.shell((err, stream) => {
          if (err) {
            this.log.error?.('[ShellManager] 创建shell流失败', {
              connectionId,
              error: err.message
            });
            reject(err);
            return;
          }
          resolve(stream);
        });
      });

      let stream;
      try {
        stream = await shellPromise;
      } catch (error) {
        return {
          error: 'shell_creation_failed',
          message: `创建Shell会话失败: ${error.message}`
        };
      }

      // 4. 创建输出文件的写入流
      const writeStream = fs.createWriteStream(outputFile, {
        flags: 'a', // 追加模式
        encoding: 'utf8'
      });

      // 5. 监听shell输出并写入文件
      stream.on('data', (data) => {
        writeStream.write(data.toString('utf8'));
      });

      // 6. 处理stream关闭事件
      stream.on('close', () => {
        this.log.debug?.('[ShellManager] Shell流已关闭', { shellId });
        writeStream.end();
        
        const shell = this.shells.get(shellId);
        if (shell) {
          shell.isActive = false;
        }
      });

      // 7. 处理stream错误事件
      stream.on('error', (error) => {
        this.log.error?.('[ShellManager] Shell流发生错误', {
          shellId,
          error: error.message
        });
        writeStream.end();
        
        const shell = this.shells.get(shellId);
        if (shell) {
          shell.isActive = false;
        }
      });

      // 8. 保存会话到会话池
      const shell = {
        shellId,
        connectionId,
        stream,
        outputFile,
        writeStream,
        isActive: true,
        createdAt: new Date()
      };

      this.shells.set(shellId, shell);

      this.log.info?.('[ShellManager] Shell会话已创建', {
        shellId,
        connectionId,
        outputFile,
        totalShells: this.shells.size
      });

      // 9. 返回会话信息
      return {
        shellId,
        outputFile
      };

    } catch (error) {
      this.log.error?.('[ShellManager] 创建shell会话时发生未预期错误', {
        connectionId,
        error: error.message,
        stack: error.stack
      });

      return {
        error: 'unknown_error',
        message: `未知错误: ${error.message}`
      };
    }
  }

  /**
   * 发送命令到会话（异步，立即返回）
   * 
   * 设计说明：
   * - 检查会话是否存在且有效
   * - 写入命令到shell流
   * - 立即返回，不等待命令完成
   * 
   * @param {string} shellId - 会话ID
   * @param {string} command - 命令
   * @returns {Promise<Object>} {ok: true} 或 {error, message}
   */
  async sendCommand(shellId, command) {
    try {
      this.log.debug?.('[ShellManager] 发送命令', { shellId, command });

      // 1. 获取会话
      const shell = this.shells.get(shellId);
      
      if (!shell) {
        this.log.warn?.('[ShellManager] Shell会话不存在', { shellId });
        return {
          error: 'shell_not_found',
          message: `Shell会话不存在：${shellId}`
        };
      }

      if (!shell.isActive) {
        this.log.warn?.('[ShellManager] Shell会话已关闭', { shellId });
        return {
          error: 'shell_closed',
          message: `Shell会话已关闭：${shellId}`
        };
      }

      // 2. 写入命令到shell流
      // 确保命令以换行符结尾
      const commandToSend = command.endsWith('\n') ? command : command + '\n';
      shell.stream.write(commandToSend);

      this.log.debug?.('[ShellManager] 命令已发送', { shellId });

      return {
        ok: true
      };

    } catch (error) {
      this.log.error?.('[ShellManager] 发送命令失败', {
        shellId,
        command,
        error: error.message,
        stack: error.stack
      });

      return {
        error: 'send_command_failed',
        message: `发送命令失败: ${error.message}`
      };
    }
  }

  /**
   * 读取指定偏移的窗口内容
   * 
   * 设计说明：
   * - 检查会话是否存在
   * - 使用fs.open() + fs.read()从指定偏移位置读取
   * - 读取最多windowSize个字符
   * - 返回output、offset、totalLength
   * 
   * @param {string} shellId - 会话ID
   * @param {number} offset - 文件偏移位置（字节数）
   * @returns {Promise<Object>} {output, offset, totalLength} 或 {error, message}
   */
  async readOutput(shellId, offset) {
    try {
      this.log.debug?.('[ShellManager] 读取输出', { shellId, offset });

      // 1. 获取会话
      const shell = this.shells.get(shellId);
      
      if (!shell) {
        this.log.warn?.('[ShellManager] Shell会话不存在', { shellId });
        return {
          error: 'shell_not_found',
          message: `Shell会话不存在：${shellId}`
        };
      }

      // 2. 获取文件状态
      let stats;
      try {
        stats = await fsp.stat(shell.outputFile);
      } catch (error) {
        this.log.error?.('[ShellManager] 读取文件状态失败', {
          shellId,
          outputFile: shell.outputFile,
          error: error.message
        });
        return {
          error: 'file_read_failed',
          message: `读取文件状态失败: ${error.message}`
        };
      }

      const totalLength = stats.size;

      // 3. 如果偏移量超出文件大小，返回空内容
      if (offset >= totalLength) {
        return {
          output: '',
          offset: totalLength,
          totalLength
        };
      }

      // 4. 打开文件并读取指定窗口
      let fileHandle;
      try {
        fileHandle = await fsp.open(shell.outputFile, 'r');
        
        // 计算要读取的字节数（最多windowSize）
        const bytesToRead = Math.min(this.windowSize, totalLength - offset);
        const buffer = Buffer.alloc(bytesToRead);
        
        // 从指定偏移位置读取
        const { bytesRead } = await fileHandle.read(buffer, 0, bytesToRead, offset);
        
        // 转换为字符串
        const output = buffer.toString('utf8', 0, bytesRead);
        
        this.log.debug?.('[ShellManager] 输出已读取', {
          shellId,
          offset,
          bytesRead,
          totalLength
        });

        return {
          output,
          offset: offset,
          totalLength
        };

      } finally {
        // 确保关闭文件句柄
        if (fileHandle) {
          await fileHandle.close();
        }
      }

    } catch (error) {
      this.log.error?.('[ShellManager] 读取输出失败', {
        shellId,
        offset,
        error: error.message,
        stack: error.stack
      });

      return {
        error: 'read_output_failed',
        message: `读取输出失败: ${error.message}`
      };
    }
  }

  /**
   * 关闭会话
   * 
   * 设计说明：
   * - 检查会话是否存在
   * - 关闭shell流
   * - 关闭写入流
   * - 从会话池中移除
   * - 保留输出文件供后续查看
   * 
   * @param {string} shellId - 会话ID
   * @returns {Promise<Object>} {ok: true} 或 {error, message}
   */
  async closeShell(shellId) {
    try {
      this.log.debug?.('[ShellManager] 开始关闭shell会话', { shellId });

      const shell = this.shells.get(shellId);
      
      if (!shell) {
        this.log.warn?.('[ShellManager] Shell会话不存在', { shellId });
        return {
          error: 'shell_not_found',
          message: `Shell会话不存在：${shellId}`
        };
      }

      // 关闭shell流
      if (shell.stream && shell.isActive) {
        shell.stream.end();
        this.log.debug?.('[ShellManager] Shell流已关闭', { shellId });
      }

      // 关闭写入流
      if (shell.writeStream) {
        shell.writeStream.end();
        this.log.debug?.('[ShellManager] 写入流已关闭', { shellId });
      }

      // 更新会话状态
      shell.isActive = false;

      // 从会话池中移除
      this.shells.delete(shellId);

      this.log.info?.('[ShellManager] Shell会话已关闭并移除', {
        shellId,
        remainingShells: this.shells.size
      });

      return {
        ok: true
      };

    } catch (error) {
      this.log.error?.('[ShellManager] 关闭shell会话失败', {
        shellId,
        error: error.message,
        stack: error.stack
      });

      return {
        error: 'close_shell_failed',
        message: `关闭Shell会话失败: ${error.message}`
      };
    }
  }

  /**
   * 清理所有会话
   * 
   * 设计说明：
   * - 遍历所有会话并逐个关闭
   * - 清空会话池
   * - 用于模块关闭时的资源清理
   * 
   * @returns {Promise<void>}
   */
  async cleanup() {
    try {
      this.log.info?.('[ShellManager] 开始清理所有shell会话', {
        count: this.shells.size
      });

      const shellIds = Array.from(this.shells.keys());
      
      for (const shellId of shellIds) {
        await this.closeShell(shellId);
      }

      this.log.info?.('[ShellManager] 所有shell会话已清理');

    } catch (error) {
      this.log.error?.('[ShellManager] 清理shell会话时发生错误', {
        error: error.message,
        stack: error.stack
      });
    }
  }
}

export default ShellManager;
