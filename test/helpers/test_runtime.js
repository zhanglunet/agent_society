/**
 * 测试辅助函数：创建测试用的 Runtime 和 AgentSociety 实例
 */

import { Runtime } from "../../src/platform/runtime.js";
import { AgentSociety } from "../../src/platform/agent_society.js";
import { Config } from "../../src/platform/utils/config/config.js";
import path from "node:path";

/**
 * 创建测试用的 Runtime 实例
 * @param {string} configDir - 配置目录路径
 * @param {object} [options] - 其他 Runtime 选项
 * @returns {Runtime}
 */
export function createTestRuntime(configDir, options = {}) {
  const configService = new Config(configDir);
  return new Runtime({
    ...options,
    configService
  });
}

/**
 * 创建测试用的 Runtime 实例（使用默认配置）
 * @param {object} [options] - Runtime 选项
 * @returns {Runtime}
 */
export function createDefaultTestRuntime(options = {}) {
  const configService = new Config("config");
  return new Runtime({
    ...options,
    configService
  });
}

/**
 * 创建测试用的 AgentSociety 实例
 * @param {string} configDir - 配置目录路径
 * @param {object} [options] - 其他 AgentSociety 选项
 * @returns {AgentSociety}
 */
export function createTestSociety(configDir, options = {}) {
  const configService = new Config(configDir);
  return new AgentSociety({
    ...options,
    configService
  });
}

/**
 * 创建测试用的 AgentSociety 实例（使用默认配置）
 * @param {object} [options] - AgentSociety 选项
 * @returns {AgentSociety}
 */
export function createDefaultTestSociety(options = {}) {
  const configService = new Config("config");
  return new AgentSociety({
    ...options,
    configService
  });
}
