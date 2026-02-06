# Agent Society Git 版本控制规范

## 1. 仓库概述

### 1.1 基本信息
- **仓库名称**: agent_society
- **远程仓库**: https://gitee.com/duzc2/agent_society.git
- **本地路径**: ~/agent_society
- **主分支**: master
- **运行时**: Bun 1.3.8

### 1.2 当前状态
- **总提交数**: 434次
- **主要贡献者**: 
  - duzc2: 433次提交
  - 杜天微: 1次提交
- **活跃分支**:
  - master (主分支，当前工作分支)
  - origin/AI (远程分支)

### 1.3 Git配置
```bash
用户名: agent_society_git_control
邮箱: git@agent_society.local
远程仓库: origin (https://gitee.com/duzc2/agent_society.git)
```

## 2. 分支策略

### 2.1 分支模型

采用 **Feature Branch Workflow**（功能分支工作流），适合软件研发团队的协作模式。

#### 主分支
- **master**: 生产分支，始终保持稳定、可部署状态
  - 只接受经过测试验证的代码
  - 每次合并必须通过代码审查和集成测试
  - 禁止直接推送到master分支

#### 功能分支
- **feature/模块名-功能描述**: 新功能开发
  - 从master创建
  - 开发完成后合并回master
  - 命名示例: `feature/ssh-file-upload`, `feature/markdown-renderer`

#### 修复分支
- **fix/模块名-问题描述**: Bug修复
  - 从master创建
  - 修复完成后合并回master
  - 命名示例: `fix/ssh-read-offset`, `fix/markdown-syntax`

#### 文档分支
- **docs/文档类型-内容**: 文档更新
  - 从master创建
  - 文档更新完成后合并回master
  - 命名示例: `docs/architecture`, `docs/user-guide`

#### 重构分支
- **refactor/模块名-重构内容**: 代码重构
  - 从master创建
  - 重构完成后合并回master
  - 命名示例: `refactor/module-manager`, `refactor/ui-components`

### 2.2 分支生命周期

```
master (稳定)
  ├── feature/xxx (开发中)
  ├── fix/xxx (修复中)
  ├── docs/xxx (编写中)
  └── refactor/xxx (重构中)
```

## 3. 提交规范

### 3.1 提交信息格式

采用 **Conventional Commits** 规范：

```
<type>(<scope>): <subject>

<body>

<footer>
```

#### Type 类型
- **feat**: 新功能
- **fix**: Bug修复
- **docs**: 文档变更
- **style**: 代码格式（不影响代码运行的变动）
- **refactor**: 重构（既不是新增功能，也不是修改bug）
- **perf**: 性能优化
- **test**: 测试相关
- **chore**: 构建过程或辅助工具的变动
- **build**: 构建系统或外部依赖的变更

#### Scope 范围
- 模块名称（如: ssh, markdown, web, agent, tools等）
- 组件名称（如: chat, file-viewer, module-manager等）

#### Subject 标题
- 使用现在时态（如"add"而非"added"）
- 首字母小写
- 结尾不加句号
- 简洁明了，不超过50个字符

#### Body 正文
- 详细描述修改内容
- 说明修改原因
- 列出相关issue

#### Footer 脚注
- 关联issue: `Closes #123`
- 破坏性变更: `BREAKING CHANGE:`

### 3.2 提交信息示例

**新功能**
```bash
feat(ssh): 增强文件上传的可靠性和日志记录

- 添加文件上传进度追踪
- 增强错误日志记录
- 提供上传状态查询接口

Closes #45
```

**Bug修复**
```bash
fix(ssh): 修正shell读取偏移量计算错误

之前使用字符数作为偏移量，导致多字节字符处理错误。
现在改为使用字节作为偏移量单位。

Fixes #89
```

**文档更新**
```bash
docs: 完善软件研发组织文档的工作规范和流程

- 更新岗位描述
- 补充工作流程图
- 添加代码审查规范
```

**重构**
```bash
refactor(modules): 移除各模块的独立面板服务端点

统一使用模块管理接口，简化架构复杂度。
```

## 4. 工作流程

### 4.1 开发流程

#### 步骤1: 创建功能分支
```bash
# 确保master是最新的
git checkout master
git pull origin master

# 创建并切换到新分支
git checkout -b feature/module-name-feature
```

#### 步骤2: 开发并提交
```bash
# 查看修改状态
git status

# 添加修改的文件
git add path/to/file.js

# 提交（遵循提交规范）
git commit -m "feat(module): 添加新功能描述"

# 可以多次提交
git add .
git commit -m "fix(module): 修复某个bug"
```

#### 步骤3: 同步最新代码
```bash
# 定期同步master最新变更
git fetch origin master
git rebase origin/master
```

#### 步骤4: 推送到远程
```bash
# 推送功能分支到远程仓库
git push origin feature/module-name-feature
```

### 4.2 代码审查流程

#### 步骤1: 提交Pull Request
- 在Gitee上创建Pull Request
- 填写PR标题（使用提交信息格式）
- 描述变更内容、测试情况
- 关联相关Issue

#### 步骤2: 代码审查
- 同岗位同事进行代码审查
- 模块负责人审核代码质量
- 测试人员验证测试覆盖率

#### 步骤3: 修改和讨论
- 根据审查意见修改代码
- 回应审查问题
- 必要时进行补充测试

#### 步骤4: 合并代码
- 审查通过后合并到master
- 使用 "Squash and merge" 保持提交历史整洁
- 删除已合并的功能分支

### 4.3 版本发布流程

#### 步骤1: 创建发布标签
```bash
# 确保master是最新的
git checkout master
git pull origin master

# 创建标签
git tag -a v1.0.0 -m "Release v1.0.0: 核心功能实现"

# 推送标签
git push origin v1.0.0
```

#### 步骤2: 版本号规范
遵循 **Semantic Versioning** (语义化版本):
- **MAJOR**: 不兼容的API修改
- **MINOR**: 向下兼容的功能性新增
- **PATCH**: 向下兼容的Bug修复

格式: `v<MAJOR>.<MINOR>.<PATCH>`

示例:
- `v1.0.0` - 首个正式版本
- `v1.1.0` - 新增功能
- `v1.1.1` - Bug修复
- `v2.0.0` - 重大更新

## 5. 团队协作规范

### 5.1 程序员职责

- 每完成一次代码交付，必须进行git提交
- 提交信息必须清晰描述本次变更
- 每个功能完成后，创建功能分支并进行PR
- 提交前确保代码通过本地测试

### 5.2 模块负责人职责

- 审核代码是否符合设计文档
- 确保模块内部代码质量
- 协调模块间的接口变更
- 验证测试覆盖率和测试用例

### 5.3 测试人员职责

- 运行测试代码，确保测试通过
- 检查代码中是否引入新bug
- 验证测试用例的充分性
- 向程序员反馈测试结果

### 5.4 Git控制职责

- 管理版本控制流程
- 监控提交历史和分支状态
- 协调代码审查流程
- 确保版本发布流程规范执行

## 6. 常用Git命令

### 6.1 日常操作

```bash
# 克隆仓库
git clone https://gitee.com/duzc2/agent_society.git

# 查看状态
git status

# 查看分支
git branch -a

# 切换分支
git checkout master

# 创建并切换分支
git checkout -b feature/new-feature

# 拉取最新代码
git pull origin master

# 推送分支
git push origin feature/new-feature
```

### 6.2 提交和合并

```bash
# 添加文件
git add .

# 提交
git commit -m "feat: 新功能"

# 修改最后一次提交
git commit --amend

# 合并分支
git merge feature/new-feature

# 变基分支
git rebase origin/master
```

### 6.3 查看历史

```bash
# 查看提交历史
git log --oneline -10

# 查看图形化历史
git log --graph --all

# 查看某次提交的详细信息
git show <commit-hash>

# 查看文件变更历史
git log --follow path/to/file.js
```

### 6.4 撤销操作

```bash
# 撤销工作区修改
git checkout -- file.js

# 撤销暂存区修改
git reset HEAD file.js

# 撤销最后一次提交（保留修改）
git reset --soft HEAD~1

# 撤销最后一次提交（丢弃修改）
git reset --hard HEAD~1
```

## 7. 最佳实践

### 7.1 提交频率
- 小步快跑，频繁提交
- 每个逻辑单元完成就提交一次
- 避免一次性提交过多代码

### 7.2 提交粒度
- 一次提交只做一件事
- 相关的修改放在一次提交中
- 不相关的修改分开提交

### 7.3 分支管理
- 功能分支保持简短
- 完成后及时删除已合并的分支
- 避免长期存在的功能分支

### 7.4 代码审查
- 所有代码必须经过审查才能合并
- 审查关注代码质量、设计一致性
- 保持建设性的审查文化

### 7.5 文档同步
- 代码变更同步更新相关文档
- 架构变更必须更新架构文档
- 接口变更必须更新接口文档

## 8. 问题排查

### 8.1 合并冲突
```bash
# 解决冲突后
git add .
git commit
git push
```

### 8.2 回退版本
```bash
# 回退到指定提交
git reset --hard <commit-hash>

# 创建回退提交
git revert <commit-hash>
```

### 8.3 清理历史
```bash
# 清理未跟踪的文件
git clean -fd

# 清理远程已删除的分支引用
git remote prune origin
```

## 9. 安全注意事项

### 9.1 敏感信息保护
- 已在.gitignore中排除:
  - agent-society-data/
  - config/llmservices.local.json
  - config/app.local.json
  - 各种日志文件和临时文件

### 9.2 提交前检查
- 确保不包含敏感信息（密码、密钥等）
- 检查临时文件是否被忽略
- 验证大文件是否应该提交

## 10. 总结

本规范旨在为Agent Society软件研发团队提供清晰的版本控制指导，确保：
- 代码提交的规范性
- 分支管理的有序性
- 团队协作的高效性
- 版本发布的可追溯性

所有团队成员应严格遵守本规范，如有疑问或建议，请联系git控制岗位。

---

**文档版本**: v1.0.0  
**创建日期**: 2026-02-05  
**维护者**: git控制  
**审核状态**: 待审核
