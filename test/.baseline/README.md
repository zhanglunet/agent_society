# 测试基准目录

此目录包含 Agent Society 项目重构前的测试基准数据。

## 目录结构

```
test/.baseline/
├── README.md                      # 本文件
├── test-results-baseline.md       # 详细的测试结果基准
├── test-statistics.json           # 测试统计数据 (JSON 格式)
├── coverage-note.md               # 覆盖率说明和配置
└── (待生成) coverage-report.json # 覆盖率报告数据
```

## 文件说明

### test-results-baseline.md
详细记录了重构前所有测试的执行结果，包括:
- 测试执行摘要
- 每个测试模块的详细结果
- 失败测试的分类和原因
- 修复建议

### test-statistics.json
以 JSON 格式记录测试统计数据，便于程序化处理和比较:
- 总体统计 (通过/失败/跳过)
- 各模块的测试结果
- 失败分类
- 关键问题列表

### coverage-note.md
说明测试覆盖率的配置和生成方法:
- 覆盖率工具说明
- 运行命令
- 覆盖率目标 (≥ 80%)
- 下一步行动

## 使用方法

### 1. 查看基准数据

```bash
# 查看详细测试结果
cat test/.baseline/test-results-baseline.md

# 查看统计数据
cat test/.baseline/test-statistics.json
```

### 2. 比较测试结果

重构后运行测试，并与基准进行比较:

```bash
# 运行测试
bun test > test-results-new.txt 2>&1

# 手动比较或使用工具比较
diff test/.baseline/test-results-baseline.md test-results-new.txt
```

### 3. 生成覆盖率报告

```bash
# 生成覆盖率
bun test --coverage

# 保存覆盖率基准 (如果支持 JSON 输出)
bun test --coverage --coverage-reporter=json > test/.baseline/coverage-report.json
```

## 基准建立时间

- **日期**: 2026-01-17
- **时间**: 18:28:57 (UTC+8)
- **测试框架**: Bun Test v1.2.1
- **Git Commit**: (待记录)

## 重要说明

1. **基准的作用**: 
   - 作为重构前的参考点
   - 确保重构不破坏现有功能
   - 跟踪测试覆盖率变化

2. **基准的维护**:
   - 基准数据应保持不变
   - 重构后的测试结果应与基准比较
   - 如果需要更新基准，应记录原因

3. **测试失败处理**:
   - 基准中记录的失败测试是已知问题
   - 重构应修复这些问题，而不是引入新问题
   - 新的测试失败应立即调查和修复

## 相关文档

- 重构需求文档: `.kiro/specs/agent-society-refactoring/requirements.md`
- 重构设计文档: `.kiro/specs/agent-society-refactoring/design.md`
- 重构任务列表: `.kiro/specs/agent-society-refactoring/tasks.md`
- 测试配置: `test/coverage-config.md`
- 测试说明: `test/README.md`

## 下一步

1. ✅ 建立测试基准 (已完成)
2. ⏭️ 修复已知的测试失败
3. ⏭️ 生成完整的覆盖率报告
4. ⏭️ 开始重构工作
5. ⏭️ 每个重构阶段后与基准比较

---

**注意**: 此基准是重构工作的重要参考，请妥善保存。
