## 现象解释（为什么停了就不再处理）

* 现在的实现把“停止”落在 `computeStatus='stopped'`，而 `ComputeScheduler._ingestMessagesToTurns()` 会直接跳过 `stopped` 智能体（见 [compute\_scheduler.js](file:///c:/Users/ASUS/Desktop/ai-build-ai/agents/src/platform/runtime/compute_scheduler.js#L91-L125)），所以队列里即便来了新消息也永远不会被转成 Turn。

* 同时如果停止时仍有 in-flight LLM/tool，调度器的 `_inFlight.has(agentId)` 也会让 ingestion 继续跳过该 agent，直到旧请求自然结束；这也会造成“停后发消息也不处理”。

## 目标语义

* 停止按钮：停止当前正在进行的处理/回合（丢弃晚到结果），并进入“暂停”状态。

* 但一旦该智能体收到新消息（来自 user 或其他智能体），应当自动恢复处理该新消息。

## 改动方案

### 1) 调度器：stopped 不再屏蔽 ingestion，而是“收到消息即自动解停”

* 修改 `ComputeScheduler._ingestMessagesToTurns()`：

  * 不再 `continue` 掉 `status === 'stopped'`；仅跳过 `stopping/terminating`。

  * 如果当前 status 为 `stopped` 且 `receiveNext(agentId)` 拿到新消息：

    * 先把 computeStatus 从 `stopped` 切回 `idle`（表示自动恢复）；

    * 再像正常流程一样 enqueue turn 并 `markReady`。

### 2) 调度器：提供一个“丢弃 inFlight 占位”的入口，避免停止后被旧请求卡死

* 在 `ComputeScheduler` 增加方法（例如 `cancelInFlight(agentId)`）：直接删除 `_inFlight` 中该 agent 的条目。

* 在停止逻辑（`RuntimeLifecycle.abortAgentLlmCall`）里调用 `runtime._computeScheduler.cancelInFlight(agentId)`，这样即使网络层 abort 失败，调度器也不会一直认为该 agent “还在跑”而拒绝接收新消息。

### 3) 停止逻辑保持：晚到结果不应让智能体无消息自启动

* 保持现有：LLM/tool `finally` 检测 `stopped/stopping/terminating` 时不 `markReady`，避免“无新消息时被晚到回调拉起”。

* 但当新消息到达把状态切回 `idle` 后，正常调度即可恢复。

### 4) 回归测试

* 新增测试：

  * 停止后（computeStatus=stopped），向该 agent 再发一条消息，断言其会恢复处理并产出对 user 的输出。

  * 停止时存在 inFlight，占位被 cancelInFlight 清理后，新消息能立即开始，不需要等待旧 promise resolve。

## 预计改动文件

* `src/platform/runtime/compute_scheduler.js`

* `src/platform/runtime/runtime_lifecycle.js`

* `test/platform/*.test.js`（新增/调整停止恢复相关用例）

