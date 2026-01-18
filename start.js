#!/usr/bin/env node
/**
 * Agent Society 服务器启动脚本
 * 
 * 用法:
 *   bun start.js [数据目录] [选项]
 *   node start.js [数据目录] [选项]
 * 
 * 选项:
 *   --port, -p <端口>  HTTP 服务器端口 (覆盖配置文件)
 *   --no-browser       不自动打开浏览器
 * 
 * 示例:
 *   bun start.js                           # 使用默认配置
 *   bun start.js ./my-data                 # 自定义数据目录
 *   bun start.js --port 3001               # 自定义端口
 *   bun start.js ./my-data -p 3001 --no-browser
 */

import { AgentSociety } from "./src/platform/agent_society.js";
import { Config } from "./src/platform/utils/config/config.js";
import { exec } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * 解析命令行参数
 * @param {string[]} args - process.argv.slice(2)
 * @returns {{dataDir: string, port: number|null, openBrowser: boolean}}
 */
export function parseArgs(args) {
  let dataDir = "./agent-society-data";
  let port = null;
  let openBrowser = true;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--port" || arg === "-p") {
      const portStr = args[++i];
      const parsed = parseInt(portStr, 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 65535) {
        port = parsed;
      }
    } else if (arg === "--no-browser") {
      openBrowser = false;
    } else if (!arg.startsWith("-")) {
      dataDir = arg;
    }
  }

  return { dataDir, port, openBrowser };
}

/**
 * 获取打开浏览器的命令
 * @param {string} platform - process.platform
 * @returns {string} 打开浏览器的命令
 */
export function getBrowserCommand(platform) {
  switch (platform) {
    case "darwin":
      return "open";
    case "win32":
      return "start";
    default:
      return "xdg-open";
  }
}


/**
 * 打开浏览器
 * @param {string} url - 要打开的 URL
 * @returns {Promise<void>}
 */
export async function openBrowserUrl(url) {
  const cmd = getBrowserCommand(process.platform);
  
  return new Promise((resolve) => {
    // Windows 的 start 命令需要特殊处理
    const fullCmd = process.platform === "win32" 
      ? `${cmd} "" "${url}"`
      : `${cmd} "${url}"`;
    
    exec(fullCmd, (error) => {
      if (error) {
        console.warn(`无法自动打开浏览器: ${error.message}`);
        console.log(`请手动打开: ${url}`);
      }
      resolve();
    });
  });
}


/**
 * 主启动函数
 */
async function main() {
  const args = process.argv.slice(2);
  const { dataDir, port: cliPort, openBrowser } = parseArgs(args);
  
  // 解析绝对路径
  const absoluteDataDir = path.resolve(dataDir);

  // 1. 创建 Config 服务实例
  const configService = new Config("config");
  
  // 2. 加载配置文件
  const config = await configService.loadApp({ dataDir: absoluteDataDir });
  
  // 3. 命令行参数覆盖配置文件
  const port = cliPort ?? config.httpPort;
  
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║           Agent Society Server                             ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log();
  console.log(`数据目录: ${absoluteDataDir}`);
  console.log(`HTTP 端口: ${port}`);
  console.log();

  // 确保数据目录存在
  if (!existsSync(absoluteDataDir)) {
    console.log(`创建数据目录: ${absoluteDataDir}`);
    await mkdir(absoluteDataDir, { recursive: true });
  }

  try {
    // 4. 创建 AgentSociety，传递 Config 服务实例和已加载的配置
    const society = new AgentSociety({
      configService,  // 传递 Config 服务实例（单例）
      config,         // 传递已加载的配置对象
      dataDir: absoluteDataDir,
      enableHttp: true,
      httpPort: port
    });

    await society.init();

    const serverUrl = `http://localhost:${port}/web/`;
    console.log(`服务器已启动: ${serverUrl}`);
    console.log();
    console.log("按 Ctrl+C 停止服务器");
    console.log();

    // 自动打开浏览器
    if (openBrowser) {
      console.log("正在打开浏览器...");
      await openBrowserUrl(serverUrl);
    }

  } catch (error) {
    const message = error?.message ?? String(error);
    
    // 检查是否是端口占用错误
    if (message.includes("EADDRINUSE") || message.includes("address already in use") || message.includes("HTTP服务器启动失败")) {
      console.error(`错误: 端口 ${port} 已被占用或HTTP服务器启动失败`);
      console.error(`请尝试使用其他端口: node start.js --port <其他端口>`);
      console.error(`详细错误: ${message}`);
      process.exit(1);
    }
    
    console.error(`启动失败: ${message}`);
    if (error?.stack) {
      console.error(`堆栈跟踪:\n${error.stack}`);
    }
    process.exit(1);
  }
}

// 运行主函数
main().catch((err) => {
  console.error("启动错误:", err);
  process.exit(1);
});
