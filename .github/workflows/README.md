# CI/CD 工作流配置文档

## 概述

本目录包含 Agent Society 项目的 CI/CD 工作流配置。

## 工作流文件

### test.yml - 测试工作流

主要的测试和覆盖率检查工作流。

#### 触发条件

- **Push**: 推送到 `main` 或 `develop` 分支
- **Pull Request**: 针对 `main` 或 `develop` 分支的 PR
- **手动触发**: 通过 GitHub Actions UI 手动触发

#### 工作流任务

##### 1. test - 运行测试

**功能**:
- 检出代码
- 设置 Bun 环境
- 安装依赖
- 运行测试套件
- 生成覆盖率报告（LCOV 和文本格式）
- 上传覆盖率报告到 Artifacts
- 上传覆盖率到 Codecov
- 在 PR 中评论测试结果

**超时时间**: 30 分钟

**失败处理**: 测试失败时工作流失败

##### 2. test-coverage - 检查覆盖率阈值

**功能**:
- 检出代码
- 设置 Bun 环境
- 安装依赖
- 运行测试并生成覆盖率
- 检查覆盖率是否达到阈值（80%）

**超时时间**: 30 分钟

**注意**: 当前 Bun 不支持内置覆盖率阈值检查，使用自定义脚本实现

##### 3. notify - 发送通知

**功能**:
- 在测试或覆盖率检查失败时发送通知
- 输出失败信息到工作流日志

**触发条件**: 仅在前置任务失败时运行

## 覆盖率报告

### 生成的报告

1. **LCOV 格式** (`coverage/lcov.info`)
   - 用于 Codecov 集成
   - 可被其他工具解析

2. **文本格式** (`coverage-report.txt`)
   - 人类可读的覆盖率摘要
   - 上传到 GitHub Artifacts

### 查看覆盖率报告

#### 方法 1: GitHub Artifacts

1. 进入 Actions 页面
2. 选择对应的工作流运行
3. 下载 `coverage-report` artifact
4. 查看 `coverage-report.txt`

#### 方法 2: Codecov

1. 访问 Codecov 仪表板
2. 查看项目覆盖率趋势
3. 查看文件级别的覆盖率详情

#### 方法 3: PR 评论

在 Pull Request 中，工作流会自动评论测试结果和覆盖率摘要。

## 测试失败通知

### 通知渠道

#### 1. GitHub Actions UI

- 工作流失败时显示红色 ❌
- 可在 Actions 页面查看详细日志

#### 2. GitHub 通知

- 工作流失败时发送邮件通知（如果启用）
- 可在 GitHub 通知中心查看

#### 3. PR 评论

- 测试失败时在 PR 中评论失败信息
- 包含测试状态和覆盖率报告

#### 4. 自定义通知（可选）

可以集成以下通知服务：

- **Slack**: 使用 `8398a7/action-slack` action
- **Discord**: 使用 `sarisia/actions-status-discord` action
- **Email**: 使用 `dawidd6/action-send-mail` action
- **Microsoft Teams**: 使用 `aliencube/microsoft-teams-actions` action

### 配置自定义通知

#### Slack 通知示例

1. 在 Slack 中创建 Incoming Webhook
2. 在 GitHub 仓库设置中添加 Secret: `SLACK_WEBHOOK`
3. 在 `test.yml` 的 `notify` 任务中取消注释 Slack 步骤

```yaml
- name: Send Slack notification
  uses: 8398a7/action-slack@v3
  with:
    status: ${{ job.status }}
    text: '测试失败！请检查 GitHub Actions 日志。'
    webhook_url: ${{ secrets.SLACK_WEBHOOK }}
  if: always()
```

## 覆盖率阈值检查

### 当前实现

使用自定义脚本 `scripts/check-coverage.js` 检查覆盖率。

### 使用方法

```bash
# 使用默认阈值 (80%)
bun run scripts/check-coverage.js

# 指定自定义阈值
bun run scripts/check-coverage.js --threshold=85

# 指定 LCOV 文件路径
bun run scripts/check-coverage.js --lcov-file=coverage/lcov.info
```

### 覆盖率计算

总体覆盖率使用加权平均计算：
- 行覆盖率: 50% 权重
- 函数覆盖率: 30% 权重
- 分支覆盖率: 20% 权重

### 阈值配置

默认阈值: **80%**

可以通过修改 `scripts/check-coverage.js` 中的 `DEFAULT_THRESHOLD` 常量来调整。

## 缓存策略

### 依赖缓存

工作流使用 `actions/cache` 缓存以下内容：
- Bun 安装缓存 (`~/.bun/install/cache`)
- Node modules (`node_modules`)

缓存键基于 `bun.lock` 文件的哈希值，确保依赖变更时重新安装。

### 缓存优势

- 加快工作流执行速度
- 减少网络请求
- 提高构建稳定性

## 工作流优化

### 超时设置

所有任务设置 30 分钟超时，防止无限等待。

### 并行执行

`test` 和 `test-coverage` 任务并行执行，提高效率。

### 错误处理

- 测试失败时立即停止工作流
- 覆盖率生成失败不影响主流程（`continue-on-error: true`）
- 通知任务仅在失败时运行

## 本地测试

在提交代码前，建议在本地运行测试：

```bash
# 运行所有测试
bun test

# 运行测试并生成覆盖率
bun test --coverage

# 检查覆盖率阈值
bun run scripts/check-coverage.js
```

## 故障排查

### 测试失败

1. 查看 Actions 日志中的错误信息
2. 在本地复现问题
3. 修复后重新提交

### 覆盖率不足

1. 运行 `bun test --coverage` 查看详细报告
2. 识别未覆盖的代码
3. 添加测试用例
4. 重新运行测试

### 工作流超时

1. 检查是否有死循环或长时间运行的测试
2. 优化测试性能
3. 考虑增加超时时间

### 依赖安装失败

1. 检查 `bun.lock` 是否提交
2. 清除缓存后重试
3. 检查依赖版本兼容性

## 最佳实践

1. **提交前测试**: 始终在本地运行测试后再提交
2. **小步提交**: 频繁提交小的变更，便于定位问题
3. **关注覆盖率**: 保持覆盖率不低于阈值
4. **及时修复**: 测试失败时立即修复，不要积累问题
5. **查看日志**: 工作流失败时仔细查看日志

## 参考资料

- [GitHub Actions 文档](https://docs.github.com/en/actions)
- [Bun 测试文档](https://bun.sh/docs/cli/test)
- [Codecov 文档](https://docs.codecov.com/)
- [项目测试文档](../../test/README.md)

## 维护

### 更新工作流

修改 `.github/workflows/test.yml` 文件后：
1. 提交变更
2. 推送到仓库
3. 工作流自动使用新配置

### 更新覆盖率脚本

修改 `scripts/check-coverage.js` 后：
1. 在本地测试脚本
2. 提交变更
3. 工作流自动使用新脚本

### 版本升级

定期检查并升级：
- GitHub Actions 版本
- Bun 版本
- 依赖包版本

## 联系方式

如有问题或建议，请：
1. 提交 Issue
2. 创建 Pull Request
3. 联系项目维护者
