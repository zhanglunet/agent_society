/**
 * 智能体实例：封装岗位信息与消息处理入口。
 */
export class Agent {
  /**
   * @param {{id:string, roleId:string, roleName:string, rolePrompt:string, behavior:Function}} options
   */
  constructor(options) {
    this.id = options.id;
    this.roleId = options.roleId;
    this.roleName = options.roleName;
    this.rolePrompt = options.rolePrompt;
    this._behavior = options.behavior;
    /**
     * system prompt 追加内容
     * 每次请求大模型时，该内容会被追加到 system 提示词最后
     * 由智能体通过工具函数 get_system_prompt_appendix / set_system_prompt_appendix 管理
     * @type {string}
     */
    this.systemPromptAppendix = "";
  }

  /**
   * 处理收到的异步消息。
   * @param {any} ctx 运行时上下文
   * @param {{payload:any, from:string, to:string, taskId?:string}} message
   * @returns {Promise<void>}
   */
  async onMessage(ctx, message) {
    await this._behavior(ctx, message);
  }
}
