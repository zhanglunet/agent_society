/**
 * 组织模板 API 服务
 * 
 * 提供与组织模板相关的后端接口调用，包括获取模板列表和模板文件内容
 * 适配后端现有的 org-templates API 端点
 * 
 * @module services/templateApi
 */

import type { OrgTemplate, TemplateContent } from '../types';

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
 * 模板相关 API 接口
 */
export const templateApi = {
  /**
   * 获取所有组织模板列表
   * 
   * 扫描 org 目录下的所有文件夹，返回可用的模板列表
   * 每个模板对应 org 目录下的一个子文件夹
   * 
   * 调用后端接口: GET /api/org-templates
   * 后端返回格式: { templates: Array<{ orgName: string; infoMd: string }>, count: number }
   * 
   * @returns 组织模板列表
   * @throws 获取失败时抛出错误
   */
  async getTemplates(): Promise<OrgTemplate[]> {
    const data = await request<{ templates: Array<{ orgName: string; infoMd: string }>; count: number }>('/org-templates');
    // 将后端格式 { orgName, infoMd } 映射到前端格式 { id, name, description }
    return data.templates.map(t => ({
      id: t.orgName,
      name: t.orgName,
      description: t.infoMd?.substring(0, 100) || '', // 取 info.md 前100字作为描述
    }));
  },

  /**
   * 获取指定模板的详细内容
   * 
   * 读取模板文件夹下的 info.md 和 org.md 文件内容
   * 需要分别调用两个后端接口获取内容
   * 
   * 调用后端接口: 
   * - GET /api/org-templates/:templateId/info
   * - GET /api/org-templates/:templateId/org
   * 
   * @param templateId - 模板 ID（文件夹名称）
   * @returns 模板文件内容，包含 info.md 和 org.md 的内容
   * @throws 获取失败时抛出错误
   */
  async getTemplateContent(templateId: string): Promise<TemplateContent> {
    const [infoData, orgData] = await Promise.all([
      request<{ orgName: string; infoMd: string }>(`/org-templates/${encodeURIComponent(templateId)}/info`),
      request<{ orgName: string; orgMd: string }>(`/org-templates/${encodeURIComponent(templateId)}/org`),
    ]);

    return {
      info: infoData.infoMd || '',
      org: orgData.orgMd || '',
    };
  },

  /**
   * 保存模板内容
   * 
   * 保存编辑后的 info.md 和 org.md 文件内容
   * 
   * 调用后端接口:
   * - PUT /api/org-templates/:templateId/info
   * - PUT /api/org-templates/:templateId/org
   * 
   * @param templateId - 模板 ID（文件夹名称）
   * @param content - 包含 info.md 和 org.md 的内容
   * @throws 保存失败时抛出错误
   */
  async saveTemplateContent(templateId: string, content: TemplateContent): Promise<void> {
    await Promise.all([
      request<void>(`/org-templates/${encodeURIComponent(templateId)}/info`, {
        method: 'PUT',
        body: JSON.stringify({ content: content.info }),
      }),
      request<void>(`/org-templates/${encodeURIComponent(templateId)}/org`, {
        method: 'PUT',
        body: JSON.stringify({ content: content.org }),
      }),
    ]);
  },
};
