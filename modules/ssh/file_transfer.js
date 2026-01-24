/**
 * 文件传输模块
 * 
 * 职责：
 * - SFTP连接管理
 * - 从工件上传文件到远程服务器（异步）
 * - 从远程服务器下载文件并保存为工件（异步）
 * - 传输任务管理（创建、跟踪、取消）
 * - 传输进度跟踪
 * 
 * 设计说明：
 * - 使用Map存储任务池，key为taskId，value为任务对象
 * - 任务状态：pending（等待中）、transferring（传输中）、completed（已完成）、failed（失败）、cancelled（已取消）
 * - 传输任务在后台执行，不阻塞工具调用
 * - 定期清理已完成的任务（保留24小时）
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

/**
 * 文件传输类
 */
class FileTransfer {
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
    this.tasks = new Map(); // taskId -> task对象
    this.taskCounter = 0; // 任务计数器，用于生成任务ID
    this.sftpSessions = new Map(); // connectionId -> sftp会话
    
    // 启动定期清理任务
    this._startCleanupTimer();
  }

  /**
   * 生成唯一的任务ID
   * @returns {string} 任务ID，格式：task_时间戳_计数器
   * @private
   */
  _generateTaskId() {
    this.taskCounter++;
    return `task_${Date.now()}_${this.taskCounter}`;
  }

  /**
   * 获取或创建SFTP会话
   * @param {string} connectionId - 连接ID
   * @returns {Promise<Object>} {ok: true, sftp} 或 {error, message}
   * @private
   */
  async _getSftpSession(connectionId) {
    try {
      // 检查是否已有SFTP会话
      if (this.sftpSessions.has(connectionId)) {
        const sftp = this.sftpSessions.get(connectionId);
        return { ok: true, sftp };
      }

      // 获取连接实例
      const connResult = this.connectionManager.getConnection(connectionId);
      if (connResult.error) {
        return connResult;
      }

      const connection = connResult.connection;
      const client = connection.client;

      // 创建SFTP会话
      const sftpPromise = new Promise((resolve, reject) => {
        client.sftp((err, sftp) => {
          if (err) {
            this.log.error?.('[FileTransfer] 创建SFTP会话失败', {
              connectionId,
              error: err.message
            });
            reject(err);
            return;
          }
          resolve(sftp);
        });
      });

      const sftp = await sftpPromise;
      this.sftpSessions.set(connectionId, sftp);

      this.log.debug?.('[FileTransfer] SFTP会话已创建', { connectionId });

      return { ok: true, sftp };

    } catch (error) {
      this.log.error?.('[FileTransfer] 获取SFTP会话失败', {
        connectionId,
        error: error.message,
        stack: error.stack
      });

      return {
        error: 'sftp_session_failed',
        message: `获取SFTP会话失败: ${error.message}`
      };
    }
  }

  /**
   * 启动上传任务（异步，立即返回）
   * 
   * 设计说明：
   * - 从工件系统读取文件内容
   * - 创建传输任务并返回任务ID
   * - 后台执行SFTP上传
   * - 返回：{taskId, fileSize, status: 'pending'}
   * 
   * @param {string} connectionId - 连接ID
   * @param {string} artifactId - 工件ID
   * @param {string} remotePath - 远程文件路径
   * @param {Object} ctx - 上下文对象
   * @returns {Promise<Object>} {taskId, fileSize, status: 'pending'} 或 {error, message}
   */
  async upload(connectionId, artifactId, remotePath, ctx) {
    try {
      this.log.debug?.('[FileTransfer] 开始上传任务', {
        connectionId,
        artifactId,
        remotePath
      });

      // 1. 从工件系统获取文件内容
      let artifactContent;
      try {
        artifactContent = await ctx.tools.getArtifact(artifactId);
        if (!artifactContent) {
          return {
            error: 'artifact_not_found',
            message: `工件不存在：${artifactId}`
          };
        }
      } catch (error) {
        this.log.error?.('[FileTransfer] 获取工件失败', {
          artifactId,
          error: error.message
        });
        return {
          error: 'artifact_not_found',
          message: `工件不存在：${artifactId}`
        };
      }

      // 2. 计算文件大小
      const fileSize = Buffer.byteLength(artifactContent, 'utf8');

      // 3. 创建传输任务
      const taskId = this._generateTaskId();
      const task = {
        taskId,
        type: 'upload',
        connectionId,
        status: 'pending',
        progress: 0,
        bytesTransferred: 0,
        totalBytes: fileSize,
        remotePath,
        artifactId,
        error: null,
        createdAt: new Date(),
        completedAt: null
      };

      this.tasks.set(taskId, task);

      this.log.info?.('[FileTransfer] 上传任务已创建', {
        taskId,
        fileSize,
        totalTasks: this.tasks.size
      });

      // 4. 后台执行上传
      this._executeUpload(task, artifactContent).catch(error => {
        this.log.error?.('[FileTransfer] 后台上传失败', {
          taskId,
          error: error.message
        });
      });

      // 5. 立即返回任务信息
      return {
        taskId,
        fileSize,
        status: 'pending'
      };

    } catch (error) {
      this.log.error?.('[FileTransfer] 创建上传任务失败', {
        connectionId,
        artifactId,
        remotePath,
        error: error.message,
        stack: error.stack
      });

      return {
        error: 'upload_task_failed',
        message: `创建上传任务失败: ${error.message}`
      };
    }
  }

  /**
   * 执行上传（后台）
   * @param {Object} task - 任务对象
   * @param {string} artifactContent - 工件内容
   * @returns {Promise<void>}
   * @private
   */
  async _executeUpload(task, artifactContent) {
    try {
      // 更新任务状态为传输中
      task.status = 'transferring';

      // 获取SFTP会话
      const sftpResult = await this._getSftpSession(task.connectionId);
      if (sftpResult.error) {
        task.status = 'failed';
        task.error = sftpResult.message;
        task.completedAt = new Date();
        return;
      }

      const sftp = sftpResult.sftp;

      // 创建写入流
      const writeStream = sftp.createWriteStream(task.remotePath);

      // 监听进度
      let bytesTransferred = 0;
      writeStream.on('drain', () => {
        bytesTransferred = writeStream.bytesWritten || 0;
        task.bytesTransferred = bytesTransferred;
        task.progress = Math.floor((bytesTransferred / task.totalBytes) * 100);
      });

      // 写入数据
      await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
        writeStream.write(artifactContent);
        writeStream.end();
      });

      // 更新任务状态为完成
      task.status = 'completed';
      task.bytesTransferred = task.totalBytes;
      task.progress = 100;
      task.completedAt = new Date();

      this.log.info?.('[FileTransfer] 上传完成', {
        taskId: task.taskId,
        remotePath: task.remotePath
      });

    } catch (error) {
      this.log.error?.('[FileTransfer] 上传失败', {
        taskId: task.taskId,
        error: error.message,
        stack: error.stack
      });

      task.status = 'failed';
      task.error = error.message;
      task.completedAt = new Date();
    }
  }

  /**
   * 启动下载任务（异步，立即返回）
   * 
   * 设计说明：
   * - 创建传输任务并返回任务ID
   * - 后台执行SFTP下载
   * - 保存到工件系统
   * - 返回：{taskId, fileSize, status: 'pending'}
   * 
   * @param {string} connectionId - 连接ID
   * @param {string} remotePath - 远程文件路径
   * @param {string} fileName - 文件名（用于工件命名）
   * @param {Object} ctx - 上下文对象
   * @returns {Promise<Object>} {taskId, fileSize, status: 'pending'} 或 {error, message}
   */
  async download(connectionId, remotePath, fileName, ctx) {
    try {
      this.log.debug?.('[FileTransfer] 开始下载任务', {
        connectionId,
        remotePath,
        fileName
      });

      // 1. 获取SFTP会话
      const sftpResult = await this._getSftpSession(connectionId);
      if (sftpResult.error) {
        return sftpResult;
      }

      const sftp = sftpResult.sftp;

      // 2. 获取远程文件大小
      let fileSize;
      try {
        const stats = await new Promise((resolve, reject) => {
          sftp.stat(remotePath, (err, stats) => {
            if (err) reject(err);
            else resolve(stats);
          });
        });
        fileSize = stats.size;
      } catch (error) {
        this.log.error?.('[FileTransfer] 获取远程文件信息失败', {
          remotePath,
          error: error.message
        });
        return {
          error: 'file_not_found',
          message: `文件不存在：${remotePath}`
        };
      }

      // 3. 创建传输任务
      const taskId = this._generateTaskId();
      const task = {
        taskId,
        type: 'download',
        connectionId,
        status: 'pending',
        progress: 0,
        bytesTransferred: 0,
        totalBytes: fileSize,
        remotePath,
        fileName,
        artifactId: null, // 下载完成后设置
        error: null,
        createdAt: new Date(),
        completedAt: null,
        ctx // 保存上下文用于后续保存工件
      };

      this.tasks.set(taskId, task);

      this.log.info?.('[FileTransfer] 下载任务已创建', {
        taskId,
        fileSize,
        totalTasks: this.tasks.size
      });

      // 4. 后台执行下载
      this._executeDownload(task).catch(error => {
        this.log.error?.('[FileTransfer] 后台下载失败', {
          taskId,
          error: error.message
        });
      });

      // 5. 立即返回任务信息
      return {
        taskId,
        fileSize,
        status: 'pending'
      };

    } catch (error) {
      this.log.error?.('[FileTransfer] 创建下载任务失败', {
        connectionId,
        remotePath,
        fileName,
        error: error.message,
        stack: error.stack
      });

      return {
        error: 'download_task_failed',
        message: `创建下载任务失败: ${error.message}`
      };
    }
  }

  /**
   * 执行下载（后台）
   * @param {Object} task - 任务对象
   * @returns {Promise<void>}
   * @private
   */
  async _executeDownload(task) {
    try {
      // 更新任务状态为传输中
      task.status = 'transferring';

      // 获取SFTP会话
      const sftpResult = await this._getSftpSession(task.connectionId);
      if (sftpResult.error) {
        task.status = 'failed';
        task.error = sftpResult.message;
        task.completedAt = new Date();
        return;
      }

      const sftp = sftpResult.sftp;

      // 创建读取流
      const readStream = sftp.createReadStream(task.remotePath);

      // 收集数据
      const chunks = [];
      let bytesTransferred = 0;

      readStream.on('data', (chunk) => {
        chunks.push(chunk);
        bytesTransferred += chunk.length;
        task.bytesTransferred = bytesTransferred;
        task.progress = Math.floor((bytesTransferred / task.totalBytes) * 100);
      });

      // 等待读取完成
      await new Promise((resolve, reject) => {
        readStream.on('end', resolve);
        readStream.on('error', reject);
      });

      // 合并数据
      const fileContent = Buffer.concat(chunks).toString('utf8');

      // 保存到工件系统
      const artifactId = await task.ctx.tools.putArtifact(task.fileName, fileContent);

      // 更新任务状态为完成
      task.status = 'completed';
      task.artifactId = artifactId;
      task.bytesTransferred = task.totalBytes;
      task.progress = 100;
      task.completedAt = new Date();

      this.log.info?.('[FileTransfer] 下载完成', {
        taskId: task.taskId,
        remotePath: task.remotePath,
        artifactId
      });

    } catch (error) {
      this.log.error?.('[FileTransfer] 下载失败', {
        taskId: task.taskId,
        error: error.message,
        stack: error.stack
      });

      task.status = 'failed';
      task.error = error.message;
      task.completedAt = new Date();
    }
  }

  /**
   * 查询传输任务状态
   * 
   * @param {string} taskId - 任务ID
   * @returns {Object} {status, progress, bytesTransferred, totalBytes, result} 或 {error, message}
   */
  getTransferStatus(taskId) {
    try {
      this.log.debug?.('[FileTransfer] 查询传输状态', { taskId });

      const task = this.tasks.get(taskId);
      
      if (!task) {
        this.log.warn?.('[FileTransfer] 任务不存在', { taskId });
        return {
          error: 'task_not_found',
          message: `任务不存在：${taskId}`
        };
      }

      // 构建返回结果
      const result = {
        status: task.status,
        progress: task.progress,
        bytesTransferred: task.bytesTransferred,
        totalBytes: task.totalBytes
      };

      // 如果任务已完成，添加结果信息
      if (task.status === 'completed') {
        if (task.type === 'download') {
          result.artifactId = task.artifactId;
        }
        result.completedAt = task.completedAt.toISOString();
      }

      // 如果任务失败，添加错误信息
      if (task.status === 'failed') {
        result.error = task.error;
        result.completedAt = task.completedAt.toISOString();
      }

      return result;

    } catch (error) {
      this.log.error?.('[FileTransfer] 查询传输状态失败', {
        taskId,
        error: error.message,
        stack: error.stack
      });

      return {
        error: 'query_status_failed',
        message: `查询传输状态失败: ${error.message}`
      };
    }
  }

  /**
   * 取消传输任务
   * 
   * @param {string} taskId - 任务ID
   * @returns {Promise<Object>} {ok: true} 或 {error, message}
   */
  async cancelTransfer(taskId) {
    try {
      this.log.debug?.('[FileTransfer] 取消传输任务', { taskId });

      const task = this.tasks.get(taskId);
      
      if (!task) {
        this.log.warn?.('[FileTransfer] 任务不存在', { taskId });
        return {
          error: 'task_not_found',
          message: `任务不存在：${taskId}`
        };
      }

      // 只能取消pending或transferring状态的任务
      if (task.status !== 'pending' && task.status !== 'transferring') {
        return {
          error: 'invalid_task_status',
          message: `任务状态不允许取消：${task.status}`
        };
      }

      // 更新任务状态为已取消
      task.status = 'cancelled';
      task.completedAt = new Date();

      this.log.info?.('[FileTransfer] 传输任务已取消', { taskId });

      return {
        ok: true
      };

    } catch (error) {
      this.log.error?.('[FileTransfer] 取消传输任务失败', {
        taskId,
        error: error.message,
        stack: error.stack
      });

      return {
        error: 'cancel_transfer_failed',
        message: `取消传输任务失败: ${error.message}`
      };
    }
  }

  /**
   * 启动定期清理任务
   * @private
   */
  _startCleanupTimer() {
    // 每小时清理一次已完成的任务（保留24小时）
    this.cleanupTimer = setInterval(() => {
      this._cleanupOldTasks();
    }, 60 * 60 * 1000); // 1小时
  }

  /**
   * 清理旧任务
   * @private
   */
  _cleanupOldTasks() {
    try {
      const now = new Date();
      const maxAge = 24 * 60 * 60 * 1000; // 24小时

      let cleanedCount = 0;

      for (const [taskId, task] of this.tasks.entries()) {
        // 只清理已完成、失败或取消的任务
        if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
          if (task.completedAt && (now - task.completedAt) > maxAge) {
            this.tasks.delete(taskId);
            cleanedCount++;
          }
        }
      }

      if (cleanedCount > 0) {
        this.log.info?.('[FileTransfer] 清理旧任务', {
          cleanedCount,
          remainingTasks: this.tasks.size
        });
      }

    } catch (error) {
      this.log.error?.('[FileTransfer] 清理旧任务失败', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * 清理资源
   * 
   * @returns {Promise<void>}
   */
  async cleanup() {
    try {
      this.log.info?.('[FileTransfer] 开始清理文件传输资源');

      // 停止清理定时器
      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = null;
      }

      // 关闭所有SFTP会话
      for (const [connectionId, sftp] of this.sftpSessions.entries()) {
        try {
          sftp.end();
          this.log.debug?.('[FileTransfer] SFTP会话已关闭', { connectionId });
        } catch (error) {
          this.log.error?.('[FileTransfer] 关闭SFTP会话失败', {
            connectionId,
            error: error.message
          });
        }
      }

      this.sftpSessions.clear();

      // 取消所有进行中的任务
      for (const [taskId, task] of this.tasks.entries()) {
        if (task.status === 'pending' || task.status === 'transferring') {
          task.status = 'cancelled';
          task.completedAt = new Date();
        }
      }

      this.log.info?.('[FileTransfer] 文件传输资源已清理');

    } catch (error) {
      this.log.error?.('[FileTransfer] 清理文件传输资源时发生错误', {
        error: error.message,
        stack: error.stack
      });
    }
  }
}

export default FileTransfer;
