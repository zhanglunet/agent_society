/**
 * 关闭管理器模块
 * 
 * 本模块负责系统的优雅关闭流程，是 Runtime 的子模块之一。
 * 
 * 【设计初衷】
 * 系统关闭时需要确保：
 * - 正在处理的消息能够完成
 * - 状态能够正确持久化
 * - 资源能够正确释放
 * 
 * 【主要功能】
 * 1. 设置优雅关闭处理（监听 SIGINT/SIGTERM）
 * 2. 执行关闭流程
 * 3. 提供关闭状态查询
 * 
 * 【关闭流程】
 * 1. 停止接收新消息
 * 2. 等待当前处理完成（有超时限制）
 * 3. 持久化组织状态
 * 4. 持久化对话历史
 * 5. 关闭 HTTP 服务器
 * 6. 退出进程
 * 
 * 【与其他模块的关系】
 * - 使用 Runtime 的 org 持久化组织状态
 * - 使用 Runtime 的 _conversationManager 持久化对话历史
 * - 控制 Runtime 的 _stopRequested 标志
 * 
 * @module runtime/shutdown_manager
 */

/**
 * 关闭管理器类
 * 
 * 负责系统的优雅关闭。
 */
export class ShutdownManager {
  /**
   * 创建关闭管理器实例
   * 
   * @param {object} runtime - Runtime 实例引用
   */
  constructor(runtime) {
    /** @type {object} Runtime 实例引用 */
    this.runtime = runtime;
  }

  /**
   * 设置优雅关闭处理
   * 
   * 监听 SIGINT 和 SIGTERM 信号，执行优雅关闭流程。
   * 第一次 Ctrl+C 触发优雅关闭，第二次 Ctrl+C 强制退出。
   * 
   * @param {object} [options] - 配置选项
   * @param {object} [options.httpServer] - HTTP 服务器实例
   * @param {number} [options.shutdownTimeoutMs=30000] - 关闭超时时间（毫秒）
   */
  setupGracefulShutdown(options = {}) {
    const runtime = this.runtime;
    
    if (runtime._forceExit) {
      process.exit(1);
    }
    
    const httpServer = options.httpServer ?? null;
    const shutdownTimeoutMs = options.shutdownTimeoutMs ?? 30000;

    // 防止重复设置
    if (runtime._gracefulShutdownSetup) {
      void runtime.log?.warn?.("优雅关闭已设置，跳过重复设置");
      return;
    }
    
    runtime._gracefulShutdownSetup = true;
    runtime._httpServerRef = httpServer;
    runtime._shutdownTimeoutMs = shutdownTimeoutMs;
    runtime._isShuttingDown = false;
    runtime._forceExit = false;
    runtime._shutdownStartTime = null;

    const shutdown = async (signal) => {
      // 第二次信号强制退出
      if (runtime._isShuttingDown) {
        runtime._forceExit = true;
        void runtime.log?.warn?.("收到第二次关闭信号，强制退出", { signal });
        process.stdout.write("\n强制退出...\n");
        process.exit(1);
      }
      
      runtime._isShuttingDown = true;
      runtime._shutdownStartTime = Date.now();
      
      process.stdout.write("\n正在优雅关闭，再按一次 Ctrl+C 强制退出...\n");
      void runtime.log?.info?.("收到关闭信号，开始优雅关闭", { signal });

      // 步骤1: 停止接收新消息
      runtime._stopRequested = true;
      void runtime.log?.info?.("已停止接收新消息");

      // 步骤2: 等待当前处理完成
      const waitStart = Date.now();
      while (runtime._processingLoopPromise && Date.now() - waitStart < shutdownTimeoutMs) {
        await new Promise((r) => setTimeout(r, 100));
      }

      const waitDuration = Date.now() - waitStart;
      const timedOut = runtime._processingLoopPromise !== null;
      if (timedOut) {
        void runtime.log?.warn?.("等待处理完成超时", { waitDuration, shutdownTimeoutMs });
      } else {
        void runtime.log?.info?.("当前处理已完成", { waitDuration });
      }

      // 步骤3: 持久化组织状态
      try {
        await runtime.org.persist();
        void runtime.log?.info?.("组织状态持久化完成");
      } catch (err) {
        const message = err && typeof err.message === "string" ? err.message : String(err);
        void runtime.log?.error?.("组织状态持久化失败", { error: message });
      }

      // 步骤3.5: 持久化对话历史
      try {
        await runtime._conversationManager.flushAll();
        void runtime.log?.info?.("对话历史持久化完成");
      } catch (err) {
        const message = err && typeof err.message === "string" ? err.message : String(err);
        void runtime.log?.error?.("对话历史持久化失败", { error: message });
      }

      // 步骤4: 关闭 HTTP 服务器
      if (runtime._httpServerRef) {
        try {
          await runtime._httpServerRef.stop();
          void runtime.log?.info?.("HTTP服务器已关闭");
        } catch (err) {
          const message = err && typeof err.message === "string" ? err.message : String(err);
          void runtime.log?.error?.("HTTP服务器关闭失败", { error: message });
        }
      }

      // 步骤5: 记录关闭摘要
      const pendingCount = runtime.bus.getPendingCount();
      const processedAgents = runtime._agents.size;
      const shutdownDuration = Date.now() - runtime._shutdownStartTime;

      void runtime.log?.info?.("关闭完成", {
        signal,
        shutdownDuration,
        pendingMessages: pendingCount,
        activeAgents: processedAgents,
        timedOut
      });

      process.exit(0);
    };

    // 注册信号处理器
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));

    void runtime.log?.info?.("优雅关闭处理已设置", { shutdownTimeoutMs });
  }

  /**
   * 手动触发优雅关闭
   * 
   * @param {object} [options] - 配置选项
   * @param {string} [options.signal="MANUAL"] - 关闭信号名称
   * @returns {Promise<{ok: boolean, pendingMessages: number, activeAgents: number, shutdownDuration: number}>}
   */
  async shutdown(options = {}) {
    const runtime = this.runtime;
    const signal = options.signal ?? "MANUAL";
    const shutdownTimeoutMs = runtime._shutdownTimeoutMs ?? 30000;

    // 防止重复触发
    if (runtime._isShuttingDown) {
      void runtime.log?.info?.("关闭已在进行中", { signal });
      return { 
        ok: false, 
        pendingMessages: runtime.bus.getPendingCount(), 
        activeAgents: runtime._agents.size,
        shutdownDuration: 0
      };
    }
    
    runtime._isShuttingDown = true;
    runtime._shutdownStartTime = Date.now();

    void runtime.log?.info?.("开始手动优雅关闭", { signal });

    // 步骤1: 停止接收新消息
    runtime._stopRequested = true;
    void runtime.log?.info?.("已停止接收新消息");

    // 步骤2: 等待当前处理完成
    const waitStart = Date.now();
    while (runtime._processingLoopPromise && Date.now() - waitStart < shutdownTimeoutMs) {
      await new Promise((r) => setTimeout(r, 100));
    }

    const waitDuration = Date.now() - waitStart;
    const timedOut = runtime._processingLoopPromise !== null;
    if (timedOut) {
      void runtime.log?.warn?.("等待处理完成超时", { waitDuration, shutdownTimeoutMs });
    } else {
      void runtime.log?.info?.("当前处理已完成", { waitDuration });
    }

    // 步骤3: 持久化组织状态
    try {
      await runtime.org.persist();
      void runtime.log?.info?.("组织状态持久化完成");
    } catch (err) {
      const message = err && typeof err.message === "string" ? err.message : String(err);
      void runtime.log?.error?.("组织状态持久化失败", { error: message });
    }

    // 步骤3.5: 持久化对话历史
    try {
      await runtime._conversationManager.flushAll();
      void runtime.log?.info?.("对话历史持久化完成");
    } catch (err) {
      const message = err && typeof err.message === "string" ? err.message : String(err);
      void runtime.log?.error?.("对话历史持久化失败", { error: message });
    }

    // 步骤4: 关闭 HTTP 服务器
    if (runtime._httpServerRef) {
      try {
        await runtime._httpServerRef.stop();
        void runtime.log?.info?.("HTTP服务器已关闭");
      } catch (err) {
        const message = err && typeof err.message === "string" ? err.message : String(err);
        void runtime.log?.error?.("HTTP服务器关闭失败", { error: message });
      }
    }

    // 步骤5: 记录关闭摘要
    const pendingCount = runtime.bus.getPendingCount();
    const processedAgents = runtime._agents.size;
    const shutdownDuration = Date.now() - runtime._shutdownStartTime;

    void runtime.log?.info?.("关闭完成", {
      signal,
      shutdownDuration,
      pendingMessages: pendingCount,
      activeAgents: processedAgents,
      timedOut
    });

    return {
      ok: true,
      pendingMessages: pendingCount,
      activeAgents: processedAgents,
      shutdownDuration
    };
  }

  /**
   * 检查是否正在关闭中
   * 
   * @returns {boolean}
   */
  isShuttingDown() {
    return this.runtime._isShuttingDown ?? false;
  }

  /**
   * 获取关闭状态信息
   * 
   * @returns {{isShuttingDown: boolean, shutdownStartTime: number|null, shutdownTimeoutMs: number|null}}
   */
  getShutdownStatus() {
    const runtime = this.runtime;
    return {
      isShuttingDown: runtime._isShuttingDown ?? false,
      shutdownStartTime: runtime._shutdownStartTime ?? null,
      shutdownTimeoutMs: runtime._shutdownTimeoutMs ?? null
    };
  }
}
