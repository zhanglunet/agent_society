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
      // 首先检查连接是否仍然有效
      const connResult = this.connectionManager.getConnection(connectionId);
      if (connResult.error) {
        // 连接无效，清理可能存在的过期SFTP会话
        if (this.sftpSessions.has(connectionId)) {
          const oldSftp = this.sftpSessions.get(connectionId);
          try { oldSftp.end(); } catch {}
          this.sftpSessions.delete(connectionId);
          this.log.debug?.('[FileTransfer] 清理过期的SFTP会话', { connectionId });
        }
        return connResult;
      }

      // 检查是否已有有效的SFTP会话
      if (this.sftpSessions.has(connectionId)) {
        const sftp = this.sftpSessions.get(connectionId);
        return { ok: true, sftp };
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

      // 注册连接断开回调，连接断开时自动清理SFTP会话
      this.connectionManager.onDisconnect?.(connectionId, () => {
        this.log.debug?.('[FileTransfer] 连接断开，自动清理SFTP会话', { connectionId });
        if (this.sftpSessions.has(connectionId)) {
          try { sftp.end(); } catch {}
          this.sftpSessions.delete(connectionId);
        }
      });

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
   * 通过主机名启动上传任务（自动管理连接）
   * 
   * 设计说明：
   * - 优先复用已有连接，无则自动创建
   * - 任务完成后自动清理连接
   * 
   * @param {string} hostName - 主机名称
   * @param {string} workspacePath - 工作区文件路径
   * @param {string} remotePath - 远程文件路径
   * @param {Object} ctx - 上下文对象
   * @returns {Promise<Object>} {taskId, fileSize, status: 'pending'} 或 {error, message}
   */
  async uploadByHost(hostName, workspacePath, remotePath, ctx) {
    try {
      this.log.debug?.('[FileTransfer] 开始通过主机名上传', { hostName, workspacePath, remotePath });

      // 1. 尝试复用已有连接
      let connectionId = null;
      const connectionsResult = this.connectionManager.listConnections();
      if (connectionsResult.ok) {
        const existingConn = connectionsResult.connections.find(
          c => c.hostName === hostName && c.status === 'connected'
        );
        if (existingConn) {
          connectionId = existingConn.connectionId;
          this.log.debug?.('[FileTransfer] 复用已有连接', { connectionId, hostName });
        }
      }

      // 2. 没有可用连接，创建新连接
      let autoCreatedConnection = false;
      if (!connectionId) {
        this.log.debug?.('[FileTransfer] 没有可用连接，创建新连接', { hostName });
        const connectResult = await this.connectionManager.connect(hostName);
        if (connectResult.error) {
          return connectResult;
        }
        connectionId = connectResult.connectionId;
        autoCreatedConnection = true;
      }

      // 3. 使用 connectionId 上传
      const result = await this.upload(connectionId, workspacePath, remotePath, ctx);
      
      // 4. 如果连接是本次创建的，记录任务以便完成后清理
      if (result.taskId && autoCreatedConnection) {
        const task = this.tasks.get(result.taskId);
        if (task) {
          task.autoManagedConnection = true;
          task.hostName = hostName;
        }
      }

      return result;

    } catch (error) {
      this.log.error?.('[FileTransfer] 通过主机名上传失败', {
        hostName,
        workspacePath,
        remotePath,
        error: error.message
      });
      return {
        error: 'upload_by_host_failed',
        message: `上传失败: ${error.message}`
      };
    }
  }

  /**
   * 启动上传任务（内部方法，通过connectionId）
   * 
   * 设计说明：
   * - 从工作区读取文件内容
   * - 创建传输任务并返回任务ID
   * - 后台执行SFTP上传
   * - 返回：{taskId, fileSize, status: 'pending'}
   * 
   * @param {string} connectionId - 连接ID
   * @param {string} workspacePath - 工作区文件路径
   * @param {string} remotePath - 远程文件路径
   * @param {Object} ctx - 上下文对象
   * @returns {Promise<Object>} {taskId, fileSize, status: 'pending'} 或 {error, message}
   */
  async upload(connectionId, workspacePath, remotePath, ctx) {
    try {
      this.log.debug?.('[FileTransfer] 开始上传任务', {
        connectionId,
        workspacePath,
        remotePath
      });

      // 1. 先检查连接是否存在（同步检查，不需要异步）
      const connResult = this.connectionManager.getConnection(connectionId);
      if (connResult.error) {
        this.log.warn?.('[FileTransfer] 连接不存在，无法创建上传任务', { connectionId, error: connResult.error });
        return {
          error: 'connection_not_found',
          message: `连接不存在：${connectionId}，请先使用 ssh_connect 建立连接`
        };
      }

      // 2. 获取工作区 ID 并获取工作区实例
      const workspaceId = this.runtime.findWorkspaceIdForAgent(ctx.agent?.id);
      if (!workspaceId) {
        return { error: 'workspace_not_assigned', message: '当前智能体未分配工作空间' };
      }
      const ws = await this.runtime.workspaceManager.getWorkspace(workspaceId);

      // 3. 先获取文件信息以确定大小
      const fileInfo = await ws.getFileInfo(workspacePath);
      if (!fileInfo) {
        return {
          error: 'file_not_found',
          message: `文件不存在：${workspacePath}`
        };
      }
      const fileSize = fileInfo.size;

      // 4. 读取完整文件内容
      // 使用实际的文件大小作为读取长度，确保读取完整内容
      const fileResult = await ws.readFile(workspacePath, { offset: 0, length: fileSize });
      if (fileResult.error) {
        return {
          error: fileResult.error,
          message: `读取工作区文件失败: ${fileResult.message || fileResult.error}`
        };
      }

      const fileContent = fileResult.content;
      this.log.info?.('[FileTransfer] 文件内容已读取', { 
        contentType: typeof fileContent, 
        contentLength: fileContent?.length,
        isBuffer: Buffer.isBuffer(fileContent)
      });

      // 5. 创建传输任务
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
        path: workspacePath,
        operator: ctx.agent?.id,
        messageId: ctx.currentMessage?.id,
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

      // 6. 后台执行上传
      this._executeUpload(task, fileContent).catch(error => {
        this.log.error?.('[FileTransfer] 后台上传失败', {
          taskId,
          error: error.message
        });
      });

      // 7. 立即返回任务信息
      return {
        taskId,
        fileSize,
        status: 'pending'
      };

    } catch (error) {
      this.log.error?.('[FileTransfer] 创建上传任务失败', {
        connectionId,
        workspacePath,
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
   * @param {string|Buffer} fileContent - 文件内容
   * @returns {Promise<void>}
   * @private
   */
  async _executeUpload(task, fileContent) {
    this.log.info?.('[FileTransfer] 开始执行上传', {
      taskId: task.taskId,
      originalRemotePath: task.remotePath,
      contentLength: fileContent?.length || 0,
      contentType: typeof fileContent
    });
    
    try {
      // 更新任务状态为传输中
      task.status = 'transferring';

      // 获取SFTP会话
      this.log.debug?.('[FileTransfer] 获取SFTP会话', { connectionId: task.connectionId });
      const sftpResult = await this._getSftpSession(task.connectionId);
      if (sftpResult.error) {
        this.log.error?.('[FileTransfer] 获取SFTP会话失败', { error: sftpResult.message });
        task.status = 'failed';
        task.error = sftpResult.message;
        task.completedAt = new Date();
        return;
      }

      const sftp = sftpResult.sftp;
      this.log.info?.('[FileTransfer] SFTP会话获取成功');

      // 解析远程路径（处理 ~ 为用户主目录）
      let remotePath = task.remotePath;
      this.log.debug?.('[FileTransfer] 处理远程路径', { originalPath: remotePath });
      
      if (remotePath.startsWith('~/')) {
        // 获取用户主目录
        const homeDir = await this._getRemoteHomeDir(sftp, task.connectionId);
        this.log.info?.('[FileTransfer] 获取到主目录', { homeDir, originalPath: remotePath });
        remotePath = remotePath.replace(/^~/, homeDir);
        this.log.info?.('[FileTransfer] 远程路径已解析', { resolvedPath: remotePath });
      }

      // 【关键】必须先解析 ~ 再提取目录路径
      const remoteDir = remotePath.substring(0, remotePath.lastIndexOf('/'));
      this.log.debug?.('[FileTransfer] 检查远程目录', { remoteDir, remotePath });
      
      if (remoteDir) {
        const mkdirResult = await this._ensureRemoteDir(sftp, remoteDir);
        if (mkdirResult.error) {
          this.log.error?.('[FileTransfer] 确保远程目录失败', { remoteDir, error: mkdirResult.message });
          task.status = 'failed';
          task.error = `创建远程目录失败: ${mkdirResult.message}`;
          task.completedAt = new Date();
          return;
        }
        this.log.debug?.('[FileTransfer] 远程目录准备就绪', { remoteDir });
      }

      // 创建写入流
      this.log.info?.('[FileTransfer] 创建写入流', { remotePath });
      
      // 检查远程路径是否有效
      if (!remotePath || remotePath.trim() === '') {
        throw new Error('远程路径为空');
      }
      
      let writeStream;
      try {
        writeStream = sftp.createWriteStream(remotePath);
      } catch (createErr) {
        this.log.error?.('[FileTransfer] 创建写入流失败', { error: createErr.message });
        throw new Error(`创建写入流失败: ${createErr.message}`);
      }
      
      if (!writeStream) {
        throw new Error('createWriteStream 返回 null');
      }
      
      this.log.info?.('[FileTransfer] 写入流创建成功', { hasWriteStream: !!writeStream });
      
      // 确保数据是 Buffer 类型
      let dataToWrite = fileContent;
      if (typeof fileContent === 'string') {
        this.log.info?.('[FileTransfer] 将字符串转为 Buffer');
        dataToWrite = Buffer.from(fileContent, 'utf8');
      }
      const dataLength = dataToWrite.length;
      this.log.info?.('[FileTransfer] 准备写入', { dataLength, dataType: typeof dataToWrite });

      // 写入数据
      this.log.info?.('[FileTransfer] 开始写入数据，设置事件监听器');
      
      await new Promise((resolve, reject) => {
        let finished = false;
        let opened = false;
        let lastBytesTransferred = 0;
        let lastProgressTime = Date.now();
        let stalledCheckTimer = null;
        
        // 检测传输是否卡住（30秒无进度则超时）
        const checkStalled = () => {
          if (finished) return;
          
          const now = Date.now();
          const currentBytes = task.bytesTransferred;
          const elapsed = now - lastProgressTime;
          
          // 如果有进度，更新时间和字节数
          if (currentBytes > lastBytesTransferred) {
            lastBytesTransferred = currentBytes;
            lastProgressTime = now;
          } else if (elapsed > 30000) {
            // 30秒无进度，判定为卡住
            finished = true;
            stalledCheckTimer = null;
            this.log.error?.('[FileTransfer] 传输卡住', { 
              elapsedMs: elapsed, 
              bytesTransferred: currentBytes, 
              totalBytes: task.totalBytes 
            });
            reject(new Error(`传输卡住：30秒无进度，已传输 ${currentBytes}/${task.totalBytes} 字节`));
            return;
          }
          
          // 继续检测
          if (!finished) {
            stalledCheckTimer = setTimeout(checkStalled, 1000);
          }
        };
        
        // 启动卡住检测
        stalledCheckTimer = setTimeout(checkStalled, 1000);
        
        writeStream.on('open', (handle) => {
          this.log.info?.('[FileTransfer] 写入流 open 事件', { handle: !!handle });
          opened = true;
        });
        
        writeStream.on('ready', () => {
          this.log.info?.('[FileTransfer] 写入流 ready 事件');
        });
        
        writeStream.on('finish', () => {
          if (finished) return;
          finished = true;
          // 清理卡住检测定时器
          if (stalledCheckTimer) {
            clearTimeout(stalledCheckTimer);
            stalledCheckTimer = null;
          }
          this.log.info?.('[FileTransfer] 写入流 finish 事件 - 上传成功');
          task.bytesTransferred = task.totalBytes;
          task.progress = 100;
          resolve();
        });
        
        writeStream.on('error', (err) => {
          if (finished) return;
          finished = true;
          // 清理卡住检测定时器
          if (stalledCheckTimer) {
            clearTimeout(stalledCheckTimer);
            stalledCheckTimer = null;
          }
          this.log.error?.('[FileTransfer] 写入流 error 事件', { 
            error: err.message, 
            code: err.code,
            opened 
          });
          reject(err);
        });
        
        writeStream.on('close', () => {
          const bytesWritten = writeStream.bytesWritten || 0;
          this.log.info?.('[FileTransfer] 写入流 close 事件', { finished, opened, bytesWritten, totalBytes: task.totalBytes });
          // 如果 close 触发但 finish 没有触发，检查是否实际写入了数据
          if (!finished) {
            finished = true;
            // 清理卡住检测定时器
            if (stalledCheckTimer) {
              clearTimeout(stalledCheckTimer);
              stalledCheckTimer = null;
            }
            if (bytesWritten >= task.totalBytes) {
              // 数据实际已写入，视为成功
              this.log.info?.('[FileTransfer] close 事件发现数据已完整写入，视为成功');
              task.bytesTransferred = task.totalBytes;
              task.progress = 100;
              resolve();
            } else {
              this.log.error?.('[FileTransfer] 流异常关闭，上传未完成', { bytesWritten, totalBytes: task.totalBytes });
              reject(new Error(`流异常关闭，仅写入 ${bytesWritten}/${task.totalBytes} 字节`));
            }
          }
        });
        
        // 监听进度
        writeStream.on('drain', () => {
          const bytesWritten = writeStream.bytesWritten || 0;
          this.log.info?.('[FileTransfer] drain 事件', { bytesWritten });
          task.bytesTransferred = bytesWritten;
          task.progress = Math.floor((bytesWritten / task.totalBytes) * 100);
        });
        
        // 延迟一点再写入，确保事件监听器已设置
        setImmediate(() => {
          try {
            this.log.info?.('[FileTransfer] 调用 write()');
            const canContinue = writeStream.write(dataToWrite, (err) => {
              if (err) {
                this.log.error?.('[FileTransfer] write 回调错误', { error: err.message });
                if (!finished) {
                  finished = true;
                  // 清理卡住检测定时器
                  if (stalledCheckTimer) {
                    clearTimeout(stalledCheckTimer);
                    stalledCheckTimer = null;
                  }
                  reject(err);
                }
                return;
              }
              this.log.info?.('[FileTransfer] write 回调成功');
            });
            
            this.log.info?.('[FileTransfer] write() 返回', { canContinue });
            
            // 如果返回 false，表示缓冲区已满，需要等待 drain 事件
            if (canContinue) {
              this.log.info?.('[FileTransfer] 缓冲区未满，调用 end()');
              writeStream.end();
            } else {
              this.log.info?.('[FileTransfer] 缓冲区已满，等待 drain 后 end()');
              writeStream.once('drain', () => {
                this.log.info?.('[FileTransfer] drain 后调用 end()');
                writeStream.end();
              });
            }
          } catch (writeErr) {
            this.log.error?.('[FileTransfer] 写入时抛出异常', { error: writeErr.message });
            if (!finished) {
              finished = true;
              // 清理卡住检测定时器
              if (stalledCheckTimer) {
                clearTimeout(stalledCheckTimer);
                stalledCheckTimer = null;
              }
              reject(writeErr);
            }
          }
        });
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

      // 如果是自动管理的连接，完成后断开
      if (task.autoManagedConnection && task.connectionId) {
        this.log.debug?.('[FileTransfer] 断开自动管理的连接', { connectionId: task.connectionId });
        await this.connectionManager.disconnect(task.connectionId);
      }

    } catch (error) {
      this.log.error?.('[FileTransfer] 上传失败', {
        taskId: task.taskId,
        error: error.message,
        stack: error.stack
      });

      task.status = 'failed';
      task.error = error.message;
      task.completedAt = new Date();

      // 失败时也要断开自动管理的连接
      if (task.autoManagedConnection && task.connectionId) {
        this.log.debug?.('[FileTransfer] 断开自动管理的连接（上传失败）', { connectionId: task.connectionId });
        await this.connectionManager.disconnect(task.connectionId);
      }
    }
  }

  /**
   * 通过主机名启动下载任务（自动管理连接）
   * 
   * 设计说明：
   * - 优先复用已有连接，无则自动创建
   * - 任务完成后自动清理连接
   * 
   * @param {string} hostName - 主机名称
   * @param {string} remotePath - 远程文件路径
   * @param {string} workspacePath - 工作区路径
   * @param {Object} ctx - 上下文对象
   * @returns {Promise<Object>} {taskId, fileSize, status: 'pending'} 或 {error, message}
   */
  async downloadByHost(hostName, remotePath, workspacePath, ctx) {
    try {
      this.log.debug?.('[FileTransfer] 开始通过主机名下载', { hostName, remotePath, workspacePath });

      // 1. 尝试复用已有连接
      let connectionId = null;
      const connectionsResult = this.connectionManager.listConnections();
      if (connectionsResult.ok) {
        const existingConn = connectionsResult.connections.find(
          c => c.hostName === hostName && c.status === 'connected'
        );
        if (existingConn) {
          connectionId = existingConn.connectionId;
          this.log.debug?.('[FileTransfer] 复用已有连接', { connectionId, hostName });
        }
      }

      // 2. 没有可用连接，创建新连接
      let autoCreatedConnection = false;
      if (!connectionId) {
        this.log.debug?.('[FileTransfer] 没有可用连接，创建新连接', { hostName });
        const connectResult = await this.connectionManager.connect(hostName);
        if (connectResult.error) {
          return connectResult;
        }
        connectionId = connectResult.connectionId;
        autoCreatedConnection = true;
      }

      // 3. 使用 connectionId 下载
      const result = await this.download(connectionId, remotePath, workspacePath, ctx);
      
      // 4. 如果连接是本次创建的，记录任务以便完成后清理
      if (result.taskId && autoCreatedConnection) {
        const task = this.tasks.get(result.taskId);
        if (task) {
          task.autoManagedConnection = true;
          task.hostName = hostName;
        }
      }

      return result;

    } catch (error) {
      this.log.error?.('[FileTransfer] 通过主机名下载失败', {
        hostName,
        remotePath,
        workspacePath,
        error: error.message
      });
      return {
        error: 'download_by_host_failed',
        message: `下载失败: ${error.message}`
      };
    }
  }

  /**
   * 启动下载任务（内部方法，通过connectionId）
   * 
   * 设计说明：
   * - 创建传输任务并返回任务ID
   * - 后台执行SFTP下载
   * - 保存到工作区
   * - 返回：{taskId, fileSize, status: 'pending'}
   * 
   * @param {string} connectionId - 连接ID
   * @param {string} remotePath - 远程文件路径
   * @param {string} workspacePath - 工作区路径
   * @param {Object} ctx - 上下文对象
   * @returns {Promise<Object>} {taskId, fileSize, status: 'pending'} 或 {error, message}
   */
  async download(connectionId, remotePath, workspacePath, ctx) {
    try {
      this.log.debug?.('[FileTransfer] 开始下载任务', {
        connectionId,
        remotePath,
        workspacePath
      });

      // 1. 先检查连接是否存在（同步检查，不需要异步）
      const connResult = this.connectionManager.getConnection(connectionId);
      if (connResult.error) {
        this.log.warn?.('[FileTransfer] 连接不存在，无法创建下载任务', { connectionId, error: connResult.error });
        return {
          error: 'connection_not_found',
          message: `连接不存在：${connectionId}，请先使用 ssh_connect 建立连接`
        };
      }

      // 2. 获取工作区 ID
      const workspaceId = this.runtime.findWorkspaceIdForAgent(ctx.agent?.id);
      if (!workspaceId) {
        return { error: 'workspace_not_assigned', message: '当前智能体未分配工作空间' };
      }

      // 3. 获取SFTP会话
      const sftpResult = await this._getSftpSession(connectionId);
      if (sftpResult.error) {
        return sftpResult;
      }

      const sftp = sftpResult.sftp;

      // 4. 获取远程文件大小
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

      // 5. 创建传输任务
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
        path: workspacePath,
        workspaceId,
        operator: ctx.agent?.id,
        messageId: ctx.currentMessage?.id,
        error: null,
        createdAt: new Date(),
        completedAt: null
      };

      this.tasks.set(taskId, task);

      this.log.info?.('[FileTransfer] 下载任务已创建', {
        taskId,
        fileSize,
        totalTasks: this.tasks.size
      });

      // 6. 后台执行下载
      this._executeDownload(task).catch(error => {
        this.log.error?.('[FileTransfer] 后台下载失败', {
          taskId,
          error: error.message
        });
      });

      // 7. 立即返回任务信息
      return {
        taskId,
        fileSize,
        status: 'pending'
      };

    } catch (error) {
      this.log.error?.('[FileTransfer] 创建下载任务失败', {
        connectionId,
        remotePath,
        workspacePath,
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
      const fileContent = Buffer.concat(chunks);

      // 保存到工作区
      const ws = await this.runtime.workspaceManager.getWorkspace(task.workspaceId);
      await ws.writeFile(task.path, fileContent, {
        operator: task.operator,
        messageId: task.messageId
      });

      // 更新任务状态为完成
      task.status = 'completed';
      task.bytesTransferred = task.totalBytes;
      task.progress = 100;
      task.completedAt = new Date();

      this.log.info?.('[FileTransfer] 下载完成', {
        taskId: task.taskId,
        remotePath: task.remotePath,
        path: task.path
      });

      // 如果是自动管理的连接，完成后断开
      if (task.autoManagedConnection && task.connectionId) {
        this.log.debug?.('[FileTransfer] 断开自动管理的连接', { connectionId: task.connectionId });
        await this.connectionManager.disconnect(task.connectionId);
      }

    } catch (error) {
      this.log.error?.('[FileTransfer] 下载失败', {
        taskId: task.taskId,
        error: error.message,
        stack: error.stack
      });

      task.status = 'failed';
      task.error = error.message;
      task.completedAt = new Date();

      // 失败时也要断开自动管理的连接
      if (task.autoManagedConnection && task.connectionId) {
        this.log.debug?.('[FileTransfer] 断开自动管理的连接（下载失败）', { connectionId: task.connectionId });
        await this.connectionManager.disconnect(task.connectionId);
      }
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
          // 下载任务：文件已保存到工作区
          result.files = [{
            path: task.path,
            mimeType: null // 下载时无法确定原始 mimeType
          }];
        }
        // 上传任务：文件上传到远程，不返回工作区文件信息
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

  listTransfers(options = {}) {
    const includeCompleted = options.includeCompleted ?? true;
    const includeFailed = options.includeFailed ?? true;
    const includeCancelled = options.includeCancelled ?? true;
    const includePending = options.includePending ?? true;
    const includeTransferring = options.includeTransferring ?? true;

    const transfers = [];

    for (const task of this.tasks.values()) {
      if (task.status === 'pending' && !includePending) continue;
      if (task.status === 'transferring' && !includeTransferring) continue;
      if (task.status === 'completed' && !includeCompleted) continue;
      if (task.status === 'failed' && !includeFailed) continue;
      if (task.status === 'cancelled' && !includeCancelled) continue;

      transfers.push({
        taskId: task.taskId,
        type: task.type,
        connectionId: task.connectionId,
        status: task.status,
        progress: task.progress,
        bytesTransferred: task.bytesTransferred,
        totalBytes: task.totalBytes,
        remotePath: task.remotePath,
        artifactId: task.artifactId ?? null,
        fileName: task.fileName ?? null,
        error: task.error ?? null,
        createdAt: task.createdAt instanceof Date ? task.createdAt.toISOString() : null,
        completedAt: task.completedAt instanceof Date ? task.completedAt.toISOString() : null
      });
    }

    transfers.sort((a, b) => {
      const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
      const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
      return tb - ta;
    });

    return { ok: true, transfers, count: transfers.length };
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
   * 获取远程用户主目录
   * @param {Object} sftp - SFTP会话
   * @param {string} connectionId - 连接ID
   * @returns {Promise<string>} 主目录路径
   * @private
   */
  async _getRemoteHomeDir(sftp, connectionId) {
    this.log.debug?.('[FileTransfer] 正在获取远程用户主目录');
    
    // 方法1: 使用 SFTP realpath
    const homeDirFromSftp = await new Promise((resolve) => {
      sftp.realpath('.', (err, path) => {
        if (err) {
          this.log.warn?.('[FileTransfer] sftp.realpath 失败', { error: err.message });
          resolve(null);
        } else {
          this.log.debug?.('[FileTransfer] sftp.realpath 返回', { path });
          resolve(path);
        }
      });
    });
    
    if (homeDirFromSftp) {
      return homeDirFromSftp;
    }
    
    // 方法2: 通过 exec 获取 $HOME
    try {
      const connResult = this.connectionManager.getConnection(connectionId);
      if (connResult.connection) {
        const homeDirFromExec = await new Promise((resolve) => {
          connResult.connection.client.exec('echo $HOME', (err, stream) => {
            if (err) {
              this.log.warn?.('[FileTransfer] exec echo $HOME 失败', { error: err.message });
              resolve(null);
              return;
            }
            let data = '';
            stream.on('data', (chunk) => { data += chunk; });
            stream.on('close', () => {
              const home = data.trim();
              this.log.debug?.('[FileTransfer] exec echo $HOME 返回', { home });
              resolve(home || null);
            });
          });
        });
        
        if (homeDirFromExec) {
          return homeDirFromExec;
        }
      }
    } catch (execErr) {
      this.log.warn?.('[FileTransfer] 通过 exec 获取主目录失败', { error: execErr.message });
    }
    
    // 方法3: 使用默认
    this.log.warn?.('[FileTransfer] 无法获取主目录，使用默认值 /root');
    return '/root';
  }

  /**
   * 确保远程目录存在（递归创建）
   * @param {Object} sftp - SFTP会话
   * @param {string} remoteDir - 远程目录路径
   * @returns {Promise<Object>} {ok: true} 或 {error, message}
   * @private
   */
  async _ensureRemoteDir(sftp, remoteDir) {
    this.log.debug?.('[FileTransfer] 确保远程目录存在', { remoteDir });
    
    try {
      // 先检查目录是否存在
      const stats = await new Promise((resolve, reject) => {
        sftp.stat(remoteDir, (err, stats) => {
          if (err) reject(err);
          else resolve(stats);
        });
      });
      
      if (stats.isDirectory()) {
        this.log.debug?.('[FileTransfer] 远程目录已存在', { remoteDir });
        return { ok: true };
      }
      
      this.log.error?.('[FileTransfer] 路径存在但不是目录', { remoteDir });
      return { error: 'not_a_directory', message: `路径存在但不是目录: ${remoteDir}` };
    } catch (err) {
      // 目录不存在，需要创建
      this.log.debug?.('[FileTransfer] 远程目录不存在，需要创建', { remoteDir, error: err.message });
      
      // 分解路径，逐级创建
      const parts = remoteDir.split('/').filter(p => p);
      let currentPath = remoteDir.startsWith('/') ? '' : '.';
      
      for (const part of parts) {
        currentPath = currentPath ? `${currentPath}/${part}` : `/${part}`;
        
        try {
          // 检查这一级是否存在
          await new Promise((resolve, reject) => {
            sftp.stat(currentPath, (err, stats) => {
              if (err) reject(err);
              else resolve(stats);
            });
          });
          this.log.debug?.('[FileTransfer] 目录层级已存在', { currentPath });
        } catch (statErr) {
          // 这一级不存在，创建它
          this.log.debug?.('[FileTransfer] 创建目录', { currentPath });
          try {
            await new Promise((resolve, reject) => {
              sftp.mkdir(currentPath, (err) => {
                if (err) reject(err);
                else resolve();
              });
            });
            this.log.info?.('[FileTransfer] 目录创建成功', { currentPath });
          } catch (mkdirErr) {
            this.log.error?.('[FileTransfer] 创建目录失败', { currentPath, error: mkdirErr.message });
            return { error: 'mkdir_failed', message: `创建目录 ${currentPath} 失败: ${mkdirErr.message}` };
          }
        }
      }
      
      return { ok: true };
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
