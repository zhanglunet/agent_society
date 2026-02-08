/**
 * SSH连接管理器
 * 
 * 职责：
 * - SSH连接的建立、维护和关闭
 * - 连接池管理
 * - 连接状态监控
 * - 连接认证（密码、密钥）
 * - 连接超时处理
 */

import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'ssh2';

/**
 * 连接管理器类
 * 
 * 设计说明：
 * - 使用Map存储连接池，key为connectionId，value为连接对象
 * - 连接ID使用时间戳+随机数生成，保证唯一性
 * - 配置文件中的hosts对象包含所有主机配置
 */
class ConnectionManager {
  /**
   * 构造函数
   * @param {Object} config - 模块配置对象
   * @param {Object} log - 日志对象
   */
  constructor(config, log) {
    this._providedConfig = config ?? {};
    this.config = {};
    this.log = log || console;
    this.connections = new Map(); // connectionId -> connection对象
    this.connectionCounter = 0; // 连接计数器，用于生成连接ID
    this._configLoaded = false;
    this._configLoadError = null;
    this._idleCleanupTimer = null;
  }

  /**
   * 生成唯一的连接ID
   * @returns {string} 连接ID，格式：conn_时间戳_计数器
   */
  generateConnectionId() {
    this.connectionCounter++;
    return `conn_${Date.now()}_${this.connectionCounter}`;
  }

  _ensureConfigLoaded() {
    if (this._configLoaded) {
      return this._configLoadError;
    }

    this._configLoaded = true;
    this._configLoadError = null;

    const provided = this._providedConfig && typeof this._providedConfig === 'object' ? this._providedConfig : {};
    const disk = this._loadConfigFromDisk();
    if (disk?.error) {
      this._configLoadError = disk;
      this.config = { hosts: {} };
      return this._configLoadError;
    }

    const merged = {
      ...(disk ?? {}),
      ...provided,
      hosts: provided.hosts !== undefined ? provided.hosts : (disk?.hosts ?? undefined)
    };

    this.config = this._normalizeConfig(merged);
    this._startIdleCleanup();
    return this._configLoadError;
  }

  _loadConfigFromDisk() {
    const candidates = [
      path.resolve(process.cwd(), 'config', 'ssh-config.json'),
      path.resolve(process.cwd(), 'modules', 'ssh', 'config.local.json')
    ];

    for (const filePath of candidates) {
      try {
        if (!fs.existsSync(filePath)) continue;
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      } catch (error) {
        return {
          error: 'config_parse_error',
          message: `配置文件解析失败: ${error.message}`
        };
      }
    }

    return null;
  }

  _normalizeConfig(config) {
    const normalized = { ...config };
    normalized.maxConnections = Number.isFinite(normalized.maxConnections) ? normalized.maxConnections : 10;
    normalized.connectionTimeout = Number.isFinite(normalized.connectionTimeout) ? normalized.connectionTimeout : 30000;
    normalized.commandTimeout = Number.isFinite(normalized.commandTimeout) ? normalized.commandTimeout : 30000;
    normalized.idleTimeout = Number.isFinite(normalized.idleTimeout) ? normalized.idleTimeout : 7200000; // 默认2小时
    normalized.keepaliveInterval = Number.isFinite(normalized.keepaliveInterval) ? normalized.keepaliveInterval : 30000; // 默认30秒保活
    normalized.keepaliveCountMax = Number.isFinite(normalized.keepaliveCountMax) ? normalized.keepaliveCountMax : 20;
    normalized.verifyHostKey = !!normalized.verifyHostKey;
    normalized.hosts = this._normalizeHosts(normalized.hosts);
    return normalized;
  }

  _normalizeHosts(hosts) {
    if (!hosts) return {};

    if (Array.isArray(hosts)) {
      const obj = {};
      for (const item of hosts) {
        if (!item || typeof item !== 'object') continue;
        const name = item.name ?? item.hostName;
        if (!name) continue;
        const { name: _n, hostName: _hn, ...rest } = item;
        obj[name] = rest;
      }
      return obj;
    }

    if (typeof hosts === 'object') {
      return hosts;
    }

    return {};
  }

  _startIdleCleanup() {
    this._stopIdleCleanup();

    const idleTimeout = this.config.idleTimeout;
    if (!Number.isFinite(idleTimeout) || idleTimeout <= 0) {
      return;
    }

    const interval = Math.max(1000, Math.min(60000, Math.floor(idleTimeout / 2)));
    this._idleCleanupTimer = setInterval(() => {
      try {
        const now = Date.now();
        const toClose = [];

        for (const [connectionId, conn] of this.connections.entries()) {
          if (!conn || conn.status !== 'connected') continue;
          const lastUsed = conn.lastUsedAt instanceof Date ? conn.lastUsedAt.getTime() : now;
          if (now - lastUsed > idleTimeout) {
            toClose.push(connectionId);
          }
        }

        for (const connectionId of toClose) {
          void this.disconnect(connectionId);
        }
      } catch {
      }
    }, interval);
  }

  _stopIdleCleanup() {
    if (this._idleCleanupTimer) {
      clearInterval(this._idleCleanupTimer);
      this._idleCleanupTimer = null;
    }
  }

  /**
   * 列出已配置的主机
   * 
   * 设计说明：
   * - 只返回主机名称和描述，不返回IP、端口、认证等敏感信息
   * - 从config.hosts对象中提取信息
   * 
   * @returns {Object} {ok: true, hosts: Array} 或 {error, message}
   */
  listHosts() {
    try {
      const configError = this._ensureConfigLoaded();
      if (configError) return configError;

      // 检查配置中是否有hosts
      if (!this.config.hosts || typeof this.config.hosts !== 'object') {
        return {
          ok: true,
          hosts: []
        };
      }

      // 提取主机名称和描述
      const hosts = Object.entries(this.config.hosts).map(([hostName, hostConfig]) => ({
        hostName,
        description: hostConfig.description || '无描述'
      }));

      this.log.debug?.('[ConnectionManager] 列出主机', { count: hosts.length });

      return {
        ok: true,
        hosts
      };
    } catch (error) {
      this.log.error?.('[ConnectionManager] 列出主机失败', {
        error: error.message,
        stack: error.stack
      });

      return {
        error: 'list_hosts_failed',
        message: `列出主机失败: ${error.message}`
      };
    }
  }

  /**
   * 通过主机名称查找配置
   * @param {string} hostName - 主机名称
   * @returns {Object|null} 主机配置对象或null
   * @private
   */
  _findHostConfig(hostName) {
    const configError = this._ensureConfigLoaded();
    if (configError) {
      return null;
    }
    if (!this.config.hosts || typeof this.config.hosts !== 'object') {
      return null;
    }
    return this.config.hosts[hostName] || null;
  }

  /**
   * 建立SSH连接
   * 
   * 设计说明：
   * - 通过主机名称从配置文件查找IP地址和认证信息
   * - 支持密码认证和密钥认证
   * - 实现连接超时控制
   * - 完整的错误处理
   * 
   * @param {string} hostName - 主机名称
   * @returns {Promise<Object>} {connectionId, status} 或 {error, message}
   */
  async connect(hostName) {
    try {
      this.log.debug?.('[ConnectionManager] 开始建立连接', { hostName });

      const configError = this._ensureConfigLoaded();
      if (configError) return configError;

      if (this.connections.size >= (this.config.maxConnections || 10)) {
        return {
          error: 'max_connections_reached',
          message: '连接数已达到上限'
        };
      }

      // 1. 通过主机名称查找配置
      const hostConfig = this._findHostConfig(hostName);
      if (!hostConfig) {
        this.log.warn?.('[ConnectionManager] 主机名称无效', { hostName });
        return {
          error: 'invalid_host_name',
          message: `主机名称无效：${hostName}，请使用ssh_list_hosts查看可用主机`
        };
      }

      // 2. 验证必需的配置项
      if (!hostConfig.host) {
        this.log.error?.('[ConnectionManager] 主机配置缺少host字段', { hostName });
        return {
          error: 'invalid_config',
          message: `主机配置无效：缺少host字段`
        };
      }

      if (!hostConfig.username) {
        this.log.error?.('[ConnectionManager] 主机配置缺少username字段', { hostName });
        return {
          error: 'invalid_config',
          message: `主机配置无效：缺少username字段`
        };
      }

      // 3. 准备连接配置
      const connectionConfig = {
        host: hostConfig.host,
        port: hostConfig.port || 22,
        username: hostConfig.username,
        readyTimeout: this.config.connectionTimeout || 30000,
        keepaliveInterval: this.config.keepaliveInterval,
        keepaliveCountMax: this.config.keepaliveCountMax
      };

      // 4. 添加认证信息（密码或密钥）
      if (hostConfig.password) {
        connectionConfig.password = hostConfig.password;
        this.log.debug?.('[ConnectionManager] 使用密码认证');
      } else if (hostConfig.privateKey) {
        // 读取私钥文件
        try {
          connectionConfig.privateKey = fs.readFileSync(hostConfig.privateKey, 'utf8');
          if (hostConfig.passphrase) {
            connectionConfig.passphrase = hostConfig.passphrase;
          }
          this.log.debug?.('[ConnectionManager] 使用密钥认证');
        } catch (error) {
          this.log.error?.('[ConnectionManager] 读取私钥文件失败', {
            privateKey: hostConfig.privateKey,
            error: error.message
          });
          return {
            error: 'key_read_failed',
            message: `读取私钥文件失败: ${error.message}`
          };
        }
      } else {
        this.log.error?.('[ConnectionManager] 主机配置缺少认证信息', { hostName });
        return {
          error: 'invalid_config',
          message: `主机配置无效：缺少password或privateKey`
        };
      }

      // 5. 创建SSH客户端并建立连接
      const client = new Client();
      const connectionId = this.generateConnectionId();

      // 使用Promise包装连接过程
      const connectPromise = new Promise((resolve, reject) => {
        // 连接成功事件
        const onReady = () => {
          this.log.info?.('[ConnectionManager] 连接建立成功', { connectionId, hostName });
          resolve();
        };

        // 连接错误事件
        const onError = (error) => {
          this.log.error?.('[ConnectionManager] 连接失败', { hostName, error: error.message });
          // 清理事件监听器，避免内存泄漏
          client.removeListener('ready', onReady);
          client.removeListener('close', onClose);
          reject(error);
        };

        // 连接关闭事件
        const onClose = () => {
          this.log.debug?.('[ConnectionManager] 连接已关闭', { connectionId });
          const conn = this.connections.get(connectionId);
          
          // 执行注册的断开回调（用于清理关联资源如 shell 会话）
          if (conn?._onDisconnect) {
            for (const callback of conn._onDisconnect) {
              try { callback(); } catch {}
            }
          }
          
          if (conn) conn.status = 'disconnected';
          this.connections.delete(connectionId);
        };

        client.once('ready', onReady);
        client.once('error', onError);
        client.once('close', onClose);

        // 发起连接
        client.connect(connectionConfig);
      });

      // 等待连接建立
      try {
        await connectPromise;
      } catch (error) {
        // 连接失败，清理客户端
        try { client.end(); } catch {}
        
        // 返回友好的错误信息
        let errorMessage = '连接失败';
        if (error.level === 'client-authentication') {
          errorMessage = '认证失败：用户名或密码错误';
        } else if (error.code === 'ECONNREFUSED') {
          errorMessage = '连接被拒绝：无法连接到目标主机';
        } else if (error.code === 'ETIMEDOUT') {
          errorMessage = '连接超时：无法在指定时间内建立连接';
        } else if (error.code === 'ENOTFOUND') {
          errorMessage = '主机不存在：无法解析主机地址';
        } else {
          errorMessage = `连接失败: ${error.message}`;
        }

        return {
          error: 'connection_failed',
          message: errorMessage
        };
      }

      // 6. 保存连接到连接池
      const connection = {
        connectionId,
        client,
        hostName,
        host: hostConfig.host,
        port: connectionConfig.port,
        username: hostConfig.username,
        status: 'connected',
        createdAt: new Date(),
        lastUsedAt: new Date(),
        _onDisconnect: [] // 连接断开时的回调数组，用于清理关联资源
      };

      this.connections.set(connectionId, connection);

      this.log.info?.('[ConnectionManager] 连接已添加到连接池', {
        connectionId,
        totalConnections: this.connections.size
      });

      // 7. 返回连接信息
      return {
        connectionId,
        status: 'connected',
        hostName
      };

    } catch (error) {
      // 捕获未预期的错误
      this.log.error?.('[ConnectionManager] 建立连接时发生未预期错误', {
        hostName,
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
   * 断开指定连接
   * 
   * 设计说明：
   * - 检查连接是否存在
   * - 关闭SSH客户端
   * - 从连接池中移除
   * - 触发连接关闭事件（由ssh2库处理）
   * 
   * @param {string} connectionId - 连接ID
   * @returns {Promise<Object>} {ok: true} 或 {error, message}
   */
  async disconnect(connectionId) {
    try {
      this.log.debug?.('[ConnectionManager] 开始断开连接', { connectionId });

      const conn = this.connections.get(connectionId);
      
      if (!conn) {
        this.log.warn?.('[ConnectionManager] 连接不存在', { connectionId });
        return {
          error: 'connection_not_found',
          message: `连接不存在：${connectionId}`
        };
      }

      // 关闭SSH客户端
      if (conn.client && conn.status === 'connected') {
        conn.client.end();
        this.log.debug?.('[ConnectionManager] SSH客户端已关闭', { connectionId });
      }

      // 更新连接状态
      conn.status = 'disconnected';

      // 从连接池中移除
      this.connections.delete(connectionId);

      this.log.info?.('[ConnectionManager] 连接已断开并移除', {
        connectionId,
        remainingConnections: this.connections.size
      });

      return {
        ok: true,
        status: 'disconnected'
      };

    } catch (error) {
      this.log.error?.('[ConnectionManager] 断开连接失败', {
        connectionId,
        error: error.message,
        stack: error.stack
      });

      return {
        error: 'disconnect_failed',
        message: `断开连接失败: ${error.message}`
      };
    }
  }

  /**
   * 更新连接的最后使用时间
   * 
   * 设计说明：
   * - 用于shell等长时间会话场景，接收数据时更新
   * - 防止空闲清理机制误断活跃连接
   * 
   * @param {string} connectionId - 连接ID
   */
  updateLastUsed(connectionId) {
    const conn = this.connections.get(connectionId);
    if (conn) {
      conn.lastUsedAt = new Date();
    }
  }

  /**
   * 注册连接断开回调
   * 
   * 设计说明：
   * - 当连接断开时（网络故障、服务器断开等），执行注册的回调
   * - 用于清理关联资源（如 shell 会话、SFTP 会话等）
   * 
   * @param {string} connectionId - 连接ID
   * @param {Function} callback - 断开时执行的回调函数
   * @returns {boolean} 是否注册成功
   */
  onDisconnect(connectionId, callback) {
    const conn = this.connections.get(connectionId);
    if (!conn || conn.status !== 'connected') {
      return false;
    }
    if (!conn._onDisconnect) {
      conn._onDisconnect = [];
    }
    conn._onDisconnect.push(callback);
    return true;
  }

  /**
   * 获取连接实例
   * 
   * 设计说明：
   * - 检查连接是否存在
   * - 检查连接是否已关闭
   * - 更新最后使用时间
   * 
   * @param {string} connectionId - 连接ID
   * @returns {Object} {ok: true, connection} 或 {error, message}
   */
  getConnection(connectionId) {
    const conn = this.connections.get(connectionId);
    
    if (!conn) {
      return {
        error: 'connection_not_found',
        message: `连接不存在：${connectionId}`
      };
    }
    
    if (conn.status === 'disconnected') {
      return {
        error: 'connection_closed',
        message: `连接已关闭：${connectionId}`
      };
    }
    
    // 更新最后使用时间
    conn.lastUsedAt = new Date();
    
    return { ok: true, connection: conn };
  }

  /**
   * 列出所有活动连接
   * 
   * 设计说明：
   * - 返回所有连接的基本信息
   * - 不包含敏感信息（密码、密钥等）
   * 
   * @returns {Object} {ok: true, connections: Array}
   */
  listConnections() {
    try {
      const configError = this._ensureConfigLoaded();
      if (configError) return configError;

      const connections = Array.from(this.connections.values()).map(conn => ({
        connectionId: conn.connectionId,
        hostName: conn.hostName,
        status: conn.status,
        createdAt: conn.createdAt.toISOString(),
        lastUsedAt: conn.lastUsedAt.toISOString()
      }));

      this.log.debug?.('[ConnectionManager] 列出所有连接', {
        count: connections.length
      });

      return {
        ok: true,
        connections
      };
    } catch (error) {
      this.log.error?.('[ConnectionManager] 列出连接失败', {
        error: error.message,
        stack: error.stack
      });

      return {
        error: 'list_connections_failed',
        message: `列出连接失败: ${error.message}`
      };
    }
  }

  /**
   * 关闭所有连接
   * 
   * 设计说明：
   * - 遍历所有连接并逐个关闭
   * - 清空连接池
   * - 用于模块关闭时的资源清理
   * 
   * @returns {Promise<void>}
   */
  async closeAll() {
    try {
      this.log.info?.('[ConnectionManager] 开始关闭所有连接', {
        count: this.connections.size
      });

      const connectionIds = Array.from(this.connections.keys());
      
      for (const connectionId of connectionIds) {
        await this.disconnect(connectionId);
      }

      this._stopIdleCleanup();

      this.log.info?.('[ConnectionManager] 所有连接已关闭');

    } catch (error) {
      this.log.error?.('[ConnectionManager] 关闭所有连接时发生错误', {
        error: error.message,
        stack: error.stack
      });
    }
  }
}

export default ConnectionManager;
