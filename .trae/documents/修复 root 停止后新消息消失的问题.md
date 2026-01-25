## 根因结论
- 停止(root)后你再发消息“像没发一样”，主要有两类原因（两者都存在）：
  1) `MessageBus.send` 会在目标智能体 `computeStatus` 为 `stopped/stopping/terminating` 时直接拒绝入队（返回 rejected），导致消息根本没进队列；
  2) 停止逻辑里会 `clearQueue(agentId)`，在 stop 与 send 并发时可能把刚入队的新消息清掉。
- 另外，上层（AgentSociety 与 /api/send）当前不会把 `MessageBus.send` 的 rejected 结果反馈给前端，因此前端表面“发送成功”，实际已丢。

## 目标语义（按你的要求）
- 停止表示“暂停当前处理/丢弃晚到结果”，但智能体仍然能接收新消息；一旦收到新消息就自动恢复处理。

## 实施方案
### 1) MessageBus：允许向 stopped/stopping 发送消息
- 修改 `MessageBus.send` 的状态门禁：
  - 只在 `terminating`（以及删除语义相关状态）时拒绝；
  - `stopped/stopping` 视为“可接收但暂时不跑”，允许入队。
- 这样 stopped 的 root 才能真正“收到新消息→恢复处理”。

### 2) 停止逻辑：不再清空 MessageBus 队列，避免误删新消息
- 修改 `RuntimeLifecycle.abortAgentLlmCall`（当前作为停止）：
  - 保留：epoch+abort、清理 TurnEngine 的 activeTurn/turn queue、清理 inFlight 占位、清理插话队列；
  - 移除：`bus.clearQueue(agentId)`。
- 这能消除“send 已入队但被 stop 清掉”的竞态。

### 3) 发送链路：把 MessageBus 拒绝显式返回给前端（兜底）
- 修改 `AgentSociety.sendTextToAgent`：读取 `bus.send()` 的返回值；若 `rejected:true` 则返回 `{error: reason}`。
- 修改 `HTTPServer._handleSend`：若 society 返回 error，则给前端返回 409/400（并带 message），避免“看似发送成功”。

### 4) 回归测试
- 新增/更新测试覆盖：
  - root 停止后发送消息，消息会入队并触发恢复处理；
  - stop 与 send 并发不会导致消息被清掉；
  - terminating 状态仍会拒绝发送，并且 /api/send 返回非 200。

## 预计改动文件
- `src/platform/core/message_bus.js`
- `src/platform/core/agent_society.js`
- `src/platform/services/http/http_server.js`
- `src/platform/runtime/runtime_lifecycle.js`
- `test/platform/*.test.js`