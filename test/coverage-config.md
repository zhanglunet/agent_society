# 代码覆盖率配置

## 覆盖率工具

本项目使用 Bun 内置的代码覆盖率工具。

## 生成覆盖率报告

### 基本命令

```bash
# 运行测试并生成覆盖率报告（文本格式）
bun test --coverage

# 生成 LCOV 格式报告（用于 CI/CD）
bun test --coverage --coverage-reporter=lcov

# 指定覆盖率报告目录
bun test --coverage --coverage-dir=./coverage
```

### 覆盖率报告格式

Bun 支持以下覆盖率报告格式：

1. **text**: 控制台文本输出（默认）
2. **lcov**: LCOV 格式，用于 CI/CD 集成

## 覆盖率目标

### 整体目标

- **最低覆盖率**: 80%
- **核心模块覆盖率**: 90%
- **关键业务逻辑**: 100%

### 模块覆盖率目标

| 模块类别 | 目标覆盖率 | 说明 |
|---------|-----------|------|
| 核心模块 (core/) | ≥ 90% | AgentSociety, Runtime, MessageBus, OrgPrimitives |
| 服务模块 (services/) | ≥ 85% | WorkspaceManager, LlmClient, ConversationManager 等 |
| Runtime 子模块 (runtime/) | ≥ 85% | AgentManager, MessageProcessor, ToolExecutor 等 |
| 工具模块 (utils/) | ≥ 80% | 消息工具、内容工具、配置工具等 |
| 扩展模块 (extensions/) | ≥ 75% | ModuleLoader, ToolGroupManager |

## 覆盖率报告解读

### 覆盖率指标

1. **语句覆盖率 (Statement Coverage)**: 执行的代码语句占总语句的百分比
2. **分支覆盖率 (Branch Coverage)**: 执行的分支（if/else）占总分支的百分比
3. **函数覆盖率 (Function Coverage)**: 调用的函数占总函数的百分比
4. **行覆盖率 (Line Coverage)**: 执行的代码行占总行数的百分比

### 示例输出

```
--------------------|---------|----------|---------|---------|-------------------
File                | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
--------------------|---------|----------|---------|---------|-------------------
All files           |   85.23 |    78.45 |   90.12 |   85.23 |                   
 src/platform/      |   88.45 |    82.34 |   92.56 |   88.45 |                   
  runtime.js        |   90.12 |    85.67 |   95.00 |   90.12 | 123,145-150       
  message_bus.js    |   95.34 |    90.12 |   100.0 |   95.34 | 78                
--------------------|---------|----------|---------|---------|-------------------
```

## 提高覆盖率的策略

### 1. 识别未覆盖代码

运行覆盖率报告后，查看 "Uncovered Line #s" 列，识别未覆盖的代码行。

### 2. 添加针对性测试

为未覆盖的代码添加测试用例：

- 正常路径测试
- 边界条件测试
- 错误处理测试
- 异常情况测试

### 3. 使用属性测试

对于通用逻辑，使用 fast-check 进行属性测试，可以自动生成大量测试用例。

```javascript
import fc from "fast-check";

test("Property: function should handle all valid inputs", () => {
  fc.assert(
    fc.property(
      fc.string(),
      fc.integer(),
      (str, num) => {
        const result = myFunction(str, num);
        return result !== null;
      }
    ),
    { numRuns: 100 }
  );
});
```

### 4. 测试错误路径

确保测试覆盖所有错误处理分支：

```javascript
test("should handle invalid input", () => {
  expect(() => myFunction(null)).toThrow();
  expect(() => myFunction(undefined)).toThrow();
  expect(() => myFunction("")).toThrow();
});
```

## CI/CD 集成

### GitHub Actions

项目已配置 GitHub Actions 自动运行测试和生成覆盖率报告。

配置文件: `.github/workflows/test.yml`

### 覆盖率报告上传

覆盖率报告自动上传到 Codecov（如果配置）：

1. 测试运行时生成 LCOV 报告
2. 上传到 Codecov
3. 在 PR 中显示覆盖率变化

## 覆盖率监控

### 本地监控

在提交代码前，运行覆盖率检查：

```bash
bun test --coverage
```

确保覆盖率不低于目标值。

### CI/CD 监控

CI/CD 流程会自动检查覆盖率：

- 覆盖率低于目标时发出警告
- 覆盖率显著下降时构建失败

## 排除文件

某些文件可能不需要测试覆盖：

- 配置文件
- 类型定义文件
- 测试辅助文件
- 第三方代码

注意：Bun 目前不支持通过配置文件排除文件，需要在 CI/CD 脚本中处理。

## 最佳实践

1. **定期检查覆盖率**: 每次提交前运行覆盖率检查
2. **关注覆盖率趋势**: 确保覆盖率不下降
3. **优先测试核心逻辑**: 先确保核心功能有高覆盖率
4. **不追求 100% 覆盖率**: 某些代码（如错误处理）可能难以测试
5. **质量优于数量**: 高覆盖率不等于高质量测试

## 常见问题

### Q: 如何查看详细的覆盖率报告？
A: 使用 `--coverage-reporter=lcov` 生成 LCOV 报告，然后使用 LCOV 查看器查看。

### Q: 覆盖率报告不准确怎么办？
A: 
- 确保测试文件正确导入被测模块
- 检查是否有未执行的测试
- 验证测试是否真正执行了目标代码

### Q: 如何提高分支覆盖率？
A:
- 测试所有 if/else 分支
- 测试所有 switch case
- 测试所有三元运算符的两个分支

### Q: 覆盖率达到 100% 就够了吗？
A: 不够。高覆盖率不等于高质量测试。还需要：
- 测试边界条件
- 测试错误处理
- 测试并发场景
- 测试性能

## 参考资料

- [Bun Test Coverage](https://bun.sh/docs/cli/test#coverage)
- [LCOV 格式说明](https://github.com/linux-test-project/lcov)
- [代码覆盖率最佳实践](https://martinfowler.com/bliki/TestCoverage.html)
