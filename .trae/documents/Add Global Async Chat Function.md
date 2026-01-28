## 目标
- 在页面提供全局异步函数：`globalThis.llmChat(messages): Promise<string>`。
- `messages` 完全由调用方提供（不注入/不改写 system），返回最终完整输出。
- 强制使用非流式模式（一次性返回完整输出），不受页面“流式输出”开关影响。
- 若页面当前正在生成/加载：不报错，自动排队等待空闲后再执行。

## 接口行为
- 输入：`messages: Array<{ role: 'user'|'assistant'|'system'; content: string }>`。
- 输出：resolve 最终文本。
- 规则：
  - 若模型未加载：reject（抛错）。
  - 若正在 loadingModel/generating：等待状态变为非忙碌后再执行。
  - 读取页面当前生成参数（nPredict/temp/topK/topP），但强制 `stream=false`。
  - 调用 `engine.chat(messages, params, abortSignal, onText)`，onText 只会拿到一次完整文本。

## 实现方案
- 修改 [src/app/app.ts]
  - 在 `createApp` 内挂载 `globalThis.llmChat`，闭包捕获 `engine`/`dom`/`state`。
  - 增加最小 runtime 校验（messages 结构合法）。
  - 增加一个“忙碌等待 + 串行队列”机制：
    - 使用 `let queue = Promise.resolve();` 保证多次 llmChat 调用串行执行，避免并发污染同一模型上下文。
    - 实现 `waitUntilIdle()`：当 `state.status.kind` 为 `loadingModel/generating` 时，注册一个 resolver；在 `setState` 里每次更新后触发检查并 resolve 等待者。
    - `llmChat` 内部执行：`queue = queue.then(async () => { await waitUntilIdle(); if (!state.model.loaded) throw; return await runChatOnce(); })`。

## 类型支持
- 新增 [src/global.d.ts]
  - 声明 `globalThis.llmChat` 的 TS 类型。

## 测试与验证
- 新增单测（例如 [test/src/app/llmChatApi.test.ts]）
  - 用 stub engine 模拟一次性返回，验证：messages 原样传入、Promise resolve 文本。
  - 用可控的 state/update 回调模拟 busy→idle，验证：busy 时不会 reject，会等待后执行。
- 运行 `bun test` 与类型诊断，确保无回归。