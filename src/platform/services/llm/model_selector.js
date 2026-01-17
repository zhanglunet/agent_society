import { createNoopModuleLogger } from "../../utils/logger/logger.js";

/**
 * 默认的模型选择提示词模板
 */
const DEFAULT_PROMPT_TEMPLATE = `你是一个模型选择助手。根据岗位职责描述，从可用的大模型服务中选择最合适的一个。

## 岗位提示词
{{ROLE_PROMPT}}

## 可用的大模型服务
{{SERVICES_LIST}}

## 任务
分析岗位提示词的职责要求，选择最匹配的大模型服务。

## 输出格式
请以 JSON 格式输出选择结果：
\`\`\`json
{
  "serviceId": "选中的服务ID",
  "reason": "选择该服务的原因"
}
\`\`\`

如果没有合适的服务，serviceId 设为 null。`;

/**
 * 模型选择器：根据岗位提示词选择合适的大模型服务
 */
export class ModelSelector {
  /**
   * @param {{
   *   llmClient: object,
   *   serviceRegistry: object,
   *   promptTemplate?: string,
   *   logger?: object
   * }} options
   */
  constructor(options) {
    this.llmClient = options.llmClient;
    this.serviceRegistry = options.serviceRegistry;
    this.promptTemplate = options.promptTemplate ?? DEFAULT_PROMPT_TEMPLATE;
    this.log = options.logger ?? createNoopModuleLogger();
    
    // 跟踪 LLM 是否被调用（用于测试）
    this._llmCallCount = 0;
  }

  /**
   * 根据岗位提示词选择合适的模型服务
   * @param {string} rolePrompt - 岗位提示词
   * @returns {Promise<{serviceId: string | null, reason: string}>}
   */
  async selectService(rolePrompt) {
    // 如果服务注册表为空，跳过选择流程
    if (!this.serviceRegistry.hasServices()) {
      void this.log.info("服务注册表为空，跳过模型选择", { rolePrompt: rolePrompt?.substring(0, 100) });
      return { serviceId: null, reason: "服务注册表为空" };
    }

    const services = this.serviceRegistry.getServices();
    const prompt = this._buildSelectionPrompt(rolePrompt, services);

    try {
      void this.log.debug("开始模型选择", {
        rolePromptLength: rolePrompt?.length ?? 0,
        availableServices: services.length
      });

      this._llmCallCount++;
      
      const response = await this.llmClient.chat({
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1 // 使用较低温度以获得更确定的结果
      });

      const content = response?.content ?? "";
      const result = this._parseSelectionResult(content, services);

      void this.log.info("模型选择完成", {
        selectedServiceId: result.serviceId,
        reason: result.reason
      });

      return result;

    } catch (err) {
      const errorMessage = err?.message ?? String(err);
      void this.log.error("模型选择过程发生异常", {
        error: errorMessage,
        rolePromptLength: rolePrompt?.length ?? 0
      });
      return { serviceId: null, reason: `选择过程异常: ${errorMessage}` };
    }
  }

  /**
   * 构建选择提示词
   * @param {string} rolePrompt - 岗位提示词
   * @param {Array<{id: string, name: string, capabilityTags: string[], description: string}>} services - 可用服务列表
   * @returns {string}
   */
  _buildSelectionPrompt(rolePrompt, services) {
    // 构建服务列表文本
    const servicesList = services.map((s, i) => {
      const tags = s.capabilityTags.join(", ");
      return `${i + 1}. ID: ${s.id}\n   名称: ${s.name}\n   能力标签: ${tags}\n   描述: ${s.description}`;
    }).join("\n\n");

    // 替换模板占位符
    let prompt = this.promptTemplate;
    prompt = prompt.replace("{{ROLE_PROMPT}}", rolePrompt ?? "");
    prompt = prompt.replace("{{SERVICES_LIST}}", servicesList);

    return prompt;
  }

  /**
   * 解析 LLM 返回的选择结果
   * @param {string} response - LLM 响应内容
   * @param {Array<{id: string}>} services - 可用服务列表
   * @returns {{serviceId: string | null, reason: string}}
   */
  _parseSelectionResult(response, services) {
    if (!response || typeof response !== "string") {
      void this.log.warn("LLM 响应为空或无效");
      return { serviceId: null, reason: "LLM 响应为空" };
    }

    try {
      // 尝试从响应中提取 JSON
      let jsonStr = response;
      
      // 如果响应包含 markdown 代码块，提取其中的 JSON
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      } else {
        // 尝试找到 JSON 对象
        const objectMatch = response.match(/\{[\s\S]*\}/);
        if (objectMatch) {
          jsonStr = objectMatch[0];
        }
      }

      const parsed = JSON.parse(jsonStr);
      const serviceId = parsed.serviceId ?? null;
      const reason = parsed.reason ?? "未提供原因";

      // 验证 serviceId 是否有效
      if (serviceId !== null) {
        const validIds = services.map(s => s.id);
        if (!validIds.includes(serviceId)) {
          void this.log.warn("LLM 返回的服务 ID 无效", {
            returnedId: serviceId,
            validIds
          });
          return { serviceId: null, reason: `无效的服务 ID: ${serviceId}` };
        }
      }

      return { serviceId, reason };

    } catch (parseErr) {
      void this.log.warn("解析 LLM 响应失败", {
        error: parseErr.message,
        responsePreview: response.substring(0, 200)
      });
      return { serviceId: null, reason: `解析响应失败: ${parseErr.message}` };
    }
  }

  /**
   * 获取 LLM 调用次数（用于测试）
   * @returns {number}
   */
  getLlmCallCount() {
    return this._llmCallCount;
  }

  /**
   * 重置 LLM 调用计数（用于测试）
   */
  resetLlmCallCount() {
    this._llmCallCount = 0;
  }
}
