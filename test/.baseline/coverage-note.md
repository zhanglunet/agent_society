# 测试覆盖率说明

## 当前状态

由于测试执行超时，未能在本次基准建立中生成完整的测试覆盖率报告。

## 覆盖率工具

项目使用 Bun 内置的测试覆盖率功能。

### 运行覆盖率命令

```bash
bun test --coverage
```

### 覆盖率目标

根据需求文档 (需求 11.3, 11.5)，测试覆盖率目标为:
- **目标覆盖率**: ≥ 80%
- **覆盖类型**: 
  - 语句覆盖率 (Statement Coverage)
  - 分支覆盖率 (Branch Coverage)
  - 函数覆盖率 (Function Coverage)
  - 行覆盖率 (Line Coverage)

## 覆盖率配置

Bun 测试框架默认支持覆盖率统计，无需额外配置。

### 生成覆盖率报告

1. **运行测试并生成覆盖率**:
   ```bash
   bun test --coverage
   ```

2. **生成 HTML 报告** (如果支持):
   ```bash
   bun test --coverage --coverage-reporter=html
   ```

3. **生成 JSON 报告**:
   ```bash
   bun test --coverage --coverage-reporter=json
   ```

## 下一步行动

1. **修复失败的测试** - 确保所有测试通过
2. **优化测试执行时间** - 解决超时问题
3. **生成完整覆盖率报告** - 运行覆盖率工具
4. **分析覆盖率数据** - 识别未覆盖的代码区域
5. **补充测试用例** - 提高覆盖率到 80% 以上

## 覆盖率基准

一旦生成覆盖率报告，应将其保存到此目录作为基准:
- `test/.baseline/coverage-report.json` - JSON 格式的覆盖率数据
- `test/.baseline/coverage-summary.md` - 覆盖率摘要文档

## 参考

- Bun 测试文档: https://bun.sh/docs/cli/test
- 项目测试配置: `test/coverage-config.md`
- 需求文档: `.kiro/specs/agent-society-refactoring/requirements.md` (需求 11.3, 11.5)
