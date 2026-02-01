/**
 * 配置管理 API 服务
 * 
 * 提供与系统配置相关的后端接口调用，包括 LLM 配置、LLM 服务管理等
 * 
 * @module services/configApi
 */

const BASE_URL = '/api';

/**
 * 发送 HTTP 请求的基础函数
 * @param endpoint - API 端点路径
 * @param options - 请求配置选项
 * @returns 解析后的 JSON 数据
 * @throws 请求失败时抛出错误
 */
async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    let detail = null;
    try {
      detail = await response.json();
    } catch {
      // 忽略 JSON 解析错误
    }
    const message = detail?.message || detail?.error || `HTTP 错误: ${response.status}`;
    throw new Error(message);
  }

  return response.json();
}

/**
 * LLM 配置接口
 */
export interface LlmConfig {
  baseURL: string;
  model: string;
  apiKey: string;
  maxTokens: number;
  maxConcurrentRequests: number;
}

/**
 * 配置状态接口
 */
export interface ConfigStatus {
  hasLocalConfig: boolean;
  llmStatus: string;
  lastError: string | null;
}

/**
 * 配置相关 API 接口
 */
export const configApi = {
  /**
   * 获取配置状态
   * 
   * 调用后端接口: GET /api/config/status
   * 
   * @returns 配置状态，包括是否为首次运行
   * @throws 获取失败时抛出错误
   */
  async getConfigStatus(): Promise<ConfigStatus> {
    return request<ConfigStatus>('/config/status');
  },

  /**
   * 获取 LLM 配置
   * 
   * 调用后端接口: GET /api/config/llm
   * 如果没有本地配置，返回 app.json 中的默认配置
   * 
   * @returns LLM 配置对象
   * @throws 获取失败时抛出错误
   */
  async getLlmConfig(): Promise<{ llm: LlmConfig; source: string }> {
    return request<{ llm: LlmConfig; source: string }>('/config/llm');
  },

  /**
   * 保存 LLM 配置
   * 
   * 调用后端接口: POST /api/config/llm
   * 保存时会自动创建 app.local.json（如果不存在）
   * 
   * @param config - LLM 配置对象
   * @throws 保存失败时抛出错误
   */
  async saveLlmConfig(config: Partial<LlmConfig>): Promise<void> {
    await request<void>('/config/llm', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  },

  /**
   * 获取 LLM 服务列表配置
   * 
   * 调用后端接口: GET /api/config/llm-services
   * 
   * @returns LLM 服务列表
   * @throws 获取失败时抛出错误
   */
  async getLlmServicesConfig(): Promise<{ services: any[]; source: string }> {
    return request<{ services: any[]; source: string }>('/config/llm-services');
  },

  /**
   * 添加 LLM 服务
   * 
   * 调用后端接口: POST /api/config/llm-services
   * 
   * @param service - 服务配置对象
   * @throws 添加失败时抛出错误
   */
  async addLlmService(service: any): Promise<void> {
    await request<void>('/config/llm-services', {
      method: 'POST',
      body: JSON.stringify(service),
    });
  },

  /**
   * 更新 LLM 服务
   * 
   * 调用后端接口: POST /api/config/llm-services/:serviceId
   * 
   * @param serviceId - 服务 ID
   * @param service - 服务配置对象
   * @throws 更新失败时抛出错误
   */
  async updateLlmService(serviceId: string, service: any): Promise<void> {
    await request<void>(`/config/llm-services/${encodeURIComponent(serviceId)}`, {
      method: 'POST',
      body: JSON.stringify(service),
    });
  },

  /**
   * 删除 LLM 服务
   * 
   * 调用后端接口: DELETE /api/config/llm-services/:serviceId
   * 
   * @param serviceId - 服务 ID
   * @throws 删除失败时抛出错误
   */
  async deleteLlmService(serviceId: string): Promise<void> {
    await request<void>(`/config/llm-services/${encodeURIComponent(serviceId)}`, {
      method: 'DELETE',
    });
  },
};
