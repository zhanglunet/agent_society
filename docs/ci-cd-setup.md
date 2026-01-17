# CI/CD 设置指南

## 概述

本文档描述 Agent Society 项目的 CI/CD 设置，包括自动化测试、覆盖率报告和测试失败通知。

## CI/CD 架构

### 工作流组件

```
GitHub Actions
├── test.yml (主工作流)
│   ├── test (运行测试)
│   ├── test-coverage (检查覆盖率)
│   └── notify (发送通知)
├── scripts/check-coverage.js (覆盖率检查脚本)
└── 通知集成 (可选)
    ├── Codecov
    ├── Slack
    ├── Discord
    └── Email
```

## 功能特性

### 1. 自动化测试运行

#### 触发条件

- **代码推送**: 推送到 `main` 或 `develop` 分支时自动运行
- **Pull Request**: 创建或更新 PR 时自动运行
- **手动触发**: 可通过 GitHub Actions UI 手动触发

#### 测试流程

1. 检出代码
2. 设置 Bun 运行环境
3. 安装项目依赖
4. 运行完整测试套件
5. 生成测试报告

#### 测试配置

- **运行环境**: Windows Latest
- **超时时间**: 30 分钟
- **并行执行**: 支持
- **失败处理**: 立即停止工作流

### 2. 代码覆盖率报告

#### 覆盖率生成

工作流自动生成两种格式的覆盖率报告：

1. **LCOV 格式** (`coverage/lcov.info`)
   - 机器可读格式
   - 用于 Codecov 集成
   - 可被其他工具解析

2. **文本格式** (`coverage-report.txt`)
   - 人类可读格式
   - 包含覆盖率摘要
   - 上传到 GitHub Artifacts

#### 覆盖率指标

- **行覆盖率** (Line Coverage): 执行的代码行占总行数的百分比
- **函数覆盖率** (Function Coverage): 调用的函数占总函数的百分比
- **分支覆盖率** (Branch Coverage): 执行的分支占总分支的百分比

#### 覆盖率阈值

- **目标覆盖率**: ≥ 80%
- **计算方法**: 加权平均
  - 行覆盖率: 50% 权重
  - 函数覆盖率: 30% 权重
  - 分支覆盖率: 20% 权重

#### 覆盖率检查

使用自定义脚本 `scripts/check-coverage.js` 检查覆盖率：

```bash
# 运行测试并检查覆盖率
npm run test:coverage:check

# 或使用 bun
bun run test:coverage:check
```

脚本功能：
- 解析 LCOV 报告
- 计算总体覆盖率
- 与阈值比较
- 生成详细报告
- 覆盖率不足时返回错误码

### 3. 测试失败通知

#### 通知渠道

##### GitHub Actions UI

- 工作流状态显示在仓库首页
- 失败时显示红色 ❌ 标记
- 可查看详细日志

##### GitHub 通知

- 工作流失败时发送邮件（如果启用）
- 显示在 GitHub 通知中心
- 支持移动端推送

##### Pull Request 评论

工作流自动在 PR 中评论：
- 测试执行状态
- 覆盖率报告摘要
- 失败测试详情
- Artifacts 链接

评论示例：

```markdown
## 测试结果 ✅ 通过

### 测试执行状态
- **状态**: ✅ 通过
- **工作流**: Tests
- **提交**: abc123...

### 覆盖率报告
```
行覆盖率: 85.23%
函数覆盖率: 90.12%
分支覆盖率: 78.45%
总体覆盖率: 84.56%
```

完整报告请查看 [Artifacts](...)
```

##### Codecov 集成

- 自动上传覆盖率到 Codecov
- 在 PR 中显示覆盖率变化
- 提供可视化覆盖率报告
- 支持覆盖率趋势分析

#### 自定义通知（可选）

可以集成以下通知服务：

##### Slack 通知

1. 在 Slack 中创建 Incoming Webhook
2. 在 GitHub 仓库设置中添加 Secret: `SLACK_WEBHOOK`
3. 在 `.github/workflows/test.yml` 中取消注释 Slack 步骤

```yaml
- name: Send Slack notification
  uses: 8398a7/action-slack@v3
  with:
    status: ${{ job.status }}
    text: '测试失败！请检查 GitHub Actions 日志。'
    webhook_url: ${{ secrets.SLACK_WEBHOOK }}
  if: always()
```

##### Discord 通知

```yaml
- name: Send Discord notification
  uses: sarisia/actions-status-discord@v1
  with:
    webhook: ${{ secrets.DISCORD_WEBHOOK }}
    status: ${{ job.status }}
    title: "测试失败"
    description: "请检查 GitHub Actions 日志"
```

##### Email 通知

```yaml
- name: Send Email notification
  uses: dawidd6/action-send-mail@v3
  with:
    server_address: smtp.gmail.com
    server_port: 465
    username: ${{ secrets.EMAIL_USERNAME }}
    password: ${{ secrets.EMAIL_PASSWORD }}
    subject: "测试失败 - ${{ github.repository }}"
    body: "工作流失败，请检查日志"
    to: team@example.com
```

## 使用指南

### 本地开发

#### 运行测试

```bash
# 运行所有测试
bun test

# 运行特定测试文件
bun test test/platform/runtime.test.js

# 运行匹配模式的测试
bun test --test-name-pattern "Property"
```

#### 生成覆盖率

```bash
# 生成覆盖率报告（文本格式）
bun test --coverage

# 生成 LCOV 格式报告
bun test --coverage --coverage-reporter=lcov

# 运行测试并检查覆盖率阈值
bun run test:coverage:check
```

#### 提交前检查

```bash
# 1. 运行测试
bun test

# 2. 检查覆盖率
bun run test:coverage:check

# 3. 如果通过，提交代码
git add .
git commit -m "feat: add new feature"
git push
```

### CI/CD 流程

#### 代码推送流程

```
开发者推送代码
    ↓
GitHub Actions 触发
    ↓
运行测试套件
    ↓
生成覆盖率报告
    ↓
检查覆盖率阈值
    ↓
上传报告到 Artifacts
    ↓
上传覆盖率到 Codecov
    ↓
发送通知（如果失败）
```

#### Pull Request 流程

```
创建/更新 PR
    ↓
GitHub Actions 触发
    ↓
运行测试套件
    ↓
生成覆盖率报告
    ↓
在 PR 中评论结果
    ↓
显示覆盖率变化
    ↓
合并前检查通过
```

### 查看结果

#### 查看测试结果

1. 进入 GitHub 仓库
2. 点击 "Actions" 标签
3. 选择对应的工作流运行
4. 查看测试日志

#### 查看覆盖率报告

##### 方法 1: GitHub Artifacts

1. 进入 Actions 页面
2. 选择工作流运行
3. 下载 "coverage-report" artifact
4. 解压并查看 `coverage-report.txt`

##### 方法 2: Codecov

1. 访问 [Codecov](https://codecov.io/)
2. 登录并选择项目
3. 查看覆盖率仪表板
4. 查看文件级别的覆盖率

##### 方法 3: PR 评论

在 Pull Request 页面查看自动评论的覆盖率摘要。

## 配置说明

### 工作流配置

工作流配置文件: `.github/workflows/test.yml`

#### 关键配置项

```yaml
# 触发条件
on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]
  workflow_dispatch:

# 超时时间
timeout-minutes: 30

# 运行环境
runs-on: windows-latest
```

#### 自定义配置

可以修改以下配置：

1. **触发分支**: 修改 `branches` 列表
2. **超时时间**: 修改 `timeout-minutes`
3. **运行环境**: 修改 `runs-on`（如 `ubuntu-latest`）
4. **覆盖率阈值**: 修改 `scripts/check-coverage.js` 中的 `DEFAULT_THRESHOLD`

### 覆盖率脚本配置

脚本文件: `scripts/check-coverage.js`

#### 配置项

```javascript
// 默认覆盖率阈值
const DEFAULT_THRESHOLD = 80;

// 默认 LCOV 文件路径
const DEFAULT_LCOV_FILE = 'coverage/lcov.info';

// 覆盖率权重
const lineWeight = 0.5;      // 行覆盖率权重
const functionWeight = 0.3;  // 函数覆盖率权重
const branchWeight = 0.2;    // 分支覆盖率权重
```

#### 命令行参数

```bash
# 指定阈值
bun run scripts/check-coverage.js --threshold=85

# 指定 LCOV 文件
bun run scripts/check-coverage.js --lcov-file=custom/path/lcov.info

# 组合使用
bun run scripts/check-coverage.js --threshold=85 --lcov-file=coverage/lcov.info
```

## 故障排查

### 常见问题

#### 1. 测试失败

**症状**: 工作流显示测试失败

**排查步骤**:
1. 查看 Actions 日志中的错误信息
2. 在本地运行相同的测试
3. 检查是否有环境差异
4. 修复问题后重新提交

**常见原因**:
- 代码逻辑错误
- 测试断言过时
- 环境配置问题
- 依赖版本不兼容

#### 2. 覆盖率不足

**症状**: 覆盖率检查失败

**排查步骤**:
1. 运行 `bun test --coverage` 查看详细报告
2. 识别未覆盖的代码区域
3. 添加针对性的测试用例
4. 重新运行测试

**提高覆盖率的方法**:
- 测试所有公共接口
- 测试边界条件
- 测试错误处理
- 使用属性测试增加覆盖面

#### 3. 工作流超时

**症状**: 工作流运行超过 30 分钟

**排查步骤**:
1. 检查是否有死循环
2. 检查是否有长时间运行的测试
3. 优化测试性能
4. 考虑增加超时时间

**优化方法**:
- 减少属性测试的 `numRuns`
- 使用 `test.only()` 隔离慢测试
- 优化异步操作
- 并行运行测试

#### 4. 依赖安装失败

**症状**: `bun install` 失败

**排查步骤**:
1. 检查 `bun.lock` 是否提交
2. 检查依赖版本兼容性
3. 清除缓存后重试
4. 检查网络连接

**解决方法**:
- 提交 `bun.lock` 文件
- 更新依赖版本
- 使用 `bun install --force`

#### 5. 覆盖率报告生成失败

**症状**: 无法生成 LCOV 报告

**排查步骤**:
1. 检查 Bun 版本
2. 检查测试是否通过
3. 检查文件权限
4. 查看详细错误日志

**解决方法**:
- 升级 Bun 到最新版本
- 确保测试通过后再生成覆盖率
- 检查 `coverage/` 目录权限

## 最佳实践

### 开发流程

1. **本地测试优先**: 提交前在本地运行测试
2. **小步提交**: 频繁提交小的变更
3. **关注覆盖率**: 保持覆盖率不低于阈值
4. **及时修复**: 测试失败时立即修复
5. **代码审查**: PR 合并前进行代码审查

### 测试编写

1. **测试先行**: 先写测试再写代码（TDD）
2. **覆盖全面**: 测试正常路径和错误路径
3. **独立性**: 测试之间相互独立
4. **可读性**: 测试描述清晰
5. **维护性**: 定期更新测试

### CI/CD 维护

1. **定期更新**: 更新 Actions 和依赖版本
2. **监控性能**: 关注工作流执行时间
3. **优化缓存**: 合理使用缓存加速构建
4. **文档更新**: 保持文档与配置同步
5. **安全检查**: 定期检查 Secrets 和权限

## 进阶配置

### 多环境测试

可以配置在多个环境中运行测试：

```yaml
strategy:
  matrix:
    os: [windows-latest, ubuntu-latest, macos-latest]
    bun-version: [latest, 1.0.0]
runs-on: ${{ matrix.os }}
```

### 条件执行

根据条件执行特定步骤：

```yaml
- name: Run integration tests
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
  run: bun test test/integration/
```

### 定时任务

定期运行测试：

```yaml
on:
  schedule:
    - cron: '0 0 * * *'  # 每天午夜运行
```

### 并发控制

限制并发工作流：

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

## 参考资料

- [GitHub Actions 文档](https://docs.github.com/en/actions)
- [Bun 测试文档](https://bun.sh/docs/cli/test)
- [Codecov 文档](https://docs.codecov.com/)
- [LCOV 格式说明](https://github.com/linux-test-project/lcov)
- [项目测试文档](../test/README.md)
- [工作流配置文档](../.github/workflows/README.md)

## 支持

如有问题或建议：
1. 查看本文档和相关文档
2. 搜索已有 Issues
3. 创建新 Issue
4. 联系项目维护者

---

**最后更新**: 2026-01-17
**维护者**: Agent Society Team
