/**
 * HTTP 客户端：为智能体提供 HTTPS 访问能力，并记录请求/响应日志。
 */
import { createNoopModuleLogger } from "../../logger.js";

/**
 * @typedef {Object} HttpRequestOptions
 * @property {string} url - 请求 URL（必须是 HTTPS）
 * @property {"GET"|"POST"|"PUT"|"DELETE"|"PATCH"|"HEAD"|"OPTIONS"} [method] - HTTP 方法，默认 GET
 * @property {Record<string, string>} [headers] - 请求头
 * @property {any} [body] - 请求体（POST/PUT/PATCH 时使用）
 * @property {number} [timeoutMs] - 超时时间（毫秒），默认 30000
 */

/**
 * @typedef {Object} HttpResponse
 * @property {number} status - HTTP 状态码
 * @property {string} statusText - 状态文本
 * @property {Record<string, string>} headers - 响应头
 * @property {string} body - 响应体文本
 * @property {number} latencyMs - 请求延迟（毫秒）
 */

/**
 * @typedef {Object} HttpRequestLog
 * @property {string} requestId - 请求唯一标识
 * @property {string} agentId - 发起请求的智能体 ID
 * @property {string} timestamp - ISO 时间戳
 * @property {string} url - 请求 URL
 * @property {string} method - HTTP 方法
 * @property {Record<string, string>} requestHeaders - 请求头
 * @property {any} requestBody - 请求体
 * @property {number} [status] - 响应状态码
 * @property {Record<string, string>} [responseHeaders] - 响应头
 * @property {string} [responseBody] - 响应体（可能被截断）
 * @property {number} [latencyMs] - 延迟
 * @property {boolean} success - 是否成功
 * @property {string} [error] - 错误信息
 */

const ALLOWED_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"];
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_RESPONSE_BODY_LOG_SIZE = 10000; // 日志中响应体最大记录长度

/**
 * HTTP 客户端类
 */
export class HttpClient {
  /**
   * @param {{logger?: import("./logger.js").ModuleLogger, maxResponseBodyLogSize?: number}} options
   */
  constructor(options = {}) {
    this.log = options.logger ?? createNoopModuleLogger();
    this.maxResponseBodyLogSize = options.maxResponseBodyLogSize ?? MAX_RESPONSE_BODY_LOG_SIZE;
    this._requestCounter = 0;
  }

  /**
   * 生成请求 ID
   * @returns {string}
   */
  _generateRequestId() {
    this._requestCounter += 1;
    const ts = Date.now().toString(36);
    const counter = this._requestCounter.toString(36).padStart(4, "0");
    return `req_${ts}_${counter}`;
  }

  /**
   * 验证 URL 是否为 HTTPS
   * @param {string} url
   * @returns {{valid: boolean, error?: string}}
   */
  _validateUrl(url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") {
        return { valid: false, error: "only_https_allowed" };
      }
      return { valid: true };
    } catch {
      return { valid: false, error: "invalid_url" };
    }
  }

  /**
   * 截断响应体用于日志记录
   * @param {string} body
   * @returns {string}
   */
  _truncateForLog(body) {
    if (!body || body.length <= this.maxResponseBodyLogSize) {
      return body;
    }
    return body.slice(0, this.maxResponseBodyLogSize) + `... [truncated, total ${body.length} chars]`;
  }

  /**
   * 发起 HTTP 请求
   * @param {string} agentId - 发起请求的智能体 ID
   * @param {HttpRequestOptions} options - 请求选项
   * @returns {Promise<{response?: HttpResponse, error?: string, requestLog: HttpRequestLog}>}
   */
  async request(agentId, options) {
    const requestId = this._generateRequestId();
    const timestamp = new Date().toISOString();
    const method = (options.method ?? "GET").toUpperCase();
    const url = options.url;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    // 初始化请求日志
    /** @type {HttpRequestLog} */
    const requestLog = {
      requestId,
      agentId,
      timestamp,
      url,
      method,
      requestHeaders: options.headers ?? {},
      requestBody: options.body ?? null,
      success: false
    };

    // 验证 URL
    const urlValidation = this._validateUrl(url);
    if (!urlValidation.valid) {
      requestLog.error = urlValidation.error;
      await this._logRequest(requestLog);
      return { error: urlValidation.error, requestLog };
    }

    // 验证 HTTP 方法
    if (!ALLOWED_METHODS.includes(method)) {
      requestLog.error = `invalid_method: ${method}`;
      await this._logRequest(requestLog);
      return { error: `invalid_method: ${method}`, requestLog };
    }

    // 准备请求选项
    /** @type {RequestInit} */
    const fetchOptions = {
      method,
      headers: { ...options.headers }
    };

    // 处理请求体
    if (options.body !== undefined && ["POST", "PUT", "PATCH"].includes(method)) {
      if (typeof options.body === "object") {
        fetchOptions.body = JSON.stringify(options.body);
        if (!fetchOptions.headers["Content-Type"] && !fetchOptions.headers["content-type"]) {
          fetchOptions.headers["Content-Type"] = "application/json";
        }
      } else {
        fetchOptions.body = String(options.body);
      }
    }

    const startTime = Date.now();

    try {
      // 使用 AbortController 实现超时
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      fetchOptions.signal = controller.signal;

      await this.log.info("HTTP 请求开始", {
        requestId,
        agentId,
        method,
        url,
        hasBody: Boolean(options.body)
      });

      const response = await fetch(url, fetchOptions);
      clearTimeout(timeoutId);

      const latencyMs = Date.now() - startTime;
      const responseBody = await response.text();

      // 转换响应头为普通对象
      const responseHeaders = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      /** @type {HttpResponse} */
      const httpResponse = {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body: responseBody,
        latencyMs
      };

      // 更新请求日志
      requestLog.status = response.status;
      requestLog.responseHeaders = responseHeaders;
      requestLog.responseBody = this._truncateForLog(responseBody);
      requestLog.latencyMs = latencyMs;
      requestLog.success = true;

      await this._logRequest(requestLog);

      return { response: httpResponse, requestLog };
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      const errorMessage = err && typeof err.message === "string" ? err.message : String(err ?? "unknown error");
      
      // 处理超时错误
      const isTimeout = err && err.name === "AbortError";
      const error = isTimeout ? "request_timeout" : errorMessage;

      requestLog.latencyMs = latencyMs;
      requestLog.error = error;

      await this._logRequest(requestLog);

      return { error, requestLog };
    }
  }

  /**
   * 记录请求日志
   * @param {HttpRequestLog} requestLog
   * @returns {Promise<void>}
   */
  async _logRequest(requestLog) {
    const level = requestLog.success ? "info" : "warn";
    const message = requestLog.success ? "HTTP 请求完成" : "HTTP 请求失败";
    
    await this.log[level](message, {
      requestId: requestLog.requestId,
      agentId: requestLog.agentId,
      method: requestLog.method,
      url: requestLog.url,
      status: requestLog.status ?? null,
      latencyMs: requestLog.latencyMs ?? null,
      success: requestLog.success,
      error: requestLog.error ?? null
    });

    // 详细日志（debug 级别）
    await this.log.debug("HTTP 请求详情", requestLog);
  }
}

/**
 * 创建 HTTP 客户端实例
 * @param {{logger?: import("./logger.js").ModuleLogger}} options
 * @returns {HttpClient}
 */
export function createHttpClient(options = {}) {
  return new HttpClient(options);
}
