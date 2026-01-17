# 测试基础设施文档

## 测试框架

本项目使用 Bun 内置的测试框架进行测试。

### 测试框架配置

- **测试运行器**: Bun Test (内置)
- **断言库**: Bun Test 内置断言 (`expect`)
- **属性测试**: fast-check (v4.5.3)
- **测试命令**: `bun test`

### 测试文件组织

测试文件按照源代码结构组织：

```
test/
├── platform/          # 平台模块测试
│   ├── runtime.test.js
│   ├── message_bus.test.js
│   ├── org_primitives.test.js
│   ├── artifact_store.test.js
│   ├── llm_client.test.js
│   └── ...
├── modules/           # 扩展模块测试
│   ├── chrome.test.js
│   └── ...
├── web/               # Web 前端测试
│   ├── agent-list.test.js
│   └── ...
├── .tmp/              # 临时测试数据目录
└── README.md          # 本文档
```

### 测试类型

#### 1. 单元测试
测试单个模块的功能，使用 `describe` 和 `test` 组织测试用例。

```javascript
import { describe, expect, test } from "bun:test";

describe("ModuleName", () => {
  test("should do something", () => {
    expect(result).toBe(expected);
  });
});
```

#### 2. 属性测试 (Property-Based Testing)
使用 fast-check 进行属性测试，验证代码在各种输入下的正确性。

```javascript
import fc from "fast-check";

test("Property: description", () => {
  fc.assert(
    fc.property(
      fc.string(),
      (input) => {
        // 测试属性
        return true;
      }
    ),
    { numRuns: 100 }
  );
});
```

#### 3. 集成测试
测试多个模块协作的场景，通常涉及文件系统、网络等外部资源。

#### 4. 端到端测试
测试完整的业务流程，从用户输入到系统输出。

### 运行测试

```bash
# 运行所有测试
bun test

# 运行特定测试文件
bun test test/platform/runtime.test.js

# 运行匹配模式的测试
bun test --test-name-pattern "Property"
```

### 代码覆盖率

Bun 内置代码覆盖率支持：

```bash
# 运行测试并生成覆盖率报告
bun test --coverage

# 查看覆盖率报告
# 覆盖率报告会输出到控制台
```

### 测试最佳实践

1. **测试文件命名**: 使用 `.test.js` 后缀
2. **测试组织**: 使用 `describe` 分组相关测试
3. **测试描述**: 清晰描述测试目的
4. **测试隔离**: 每个测试应该独立，不依赖其他测试
5. **清理资源**: 测试后清理临时文件和资源
6. **属性测试**: 对于通用逻辑使用属性测试增加覆盖面

### 临时文件管理

测试使用的临时文件统一存放在 `test/.tmp/` 目录下：

- 每个测试使用唯一的子目录
- 测试结束后清理临时文件
- 使用 `rm(dir, { recursive: true, force: true })` 清理

### 异步测试

使用 `async/await` 处理异步操作：

```javascript
test("async operation", async () => {
  const result = await asyncFunction();
  expect(result).toBe(expected);
});
```

### 测试覆盖目标

- **单元测试覆盖率**: ≥ 80%
- **核心模块覆盖率**: ≥ 90%
- **关键业务逻辑**: 100%

## 测试环境配置

### 环境变量

测试环境不需要特殊的环境变量配置。

### 依赖项

测试依赖项已在 `package.json` 中配置：

```json
{
  "devDependencies": {
    "fast-check": "^4.5.3"
  }
}
```

### 测试数据

测试数据存放在 `test/.tmp/` 目录下，每次测试运行时动态生成。

## 持续集成

### CI/CD 配置

项目使用 GitHub Actions 或其他 CI/CD 工具自动运行测试。

CI/CD 流程：
1. 代码提交触发 CI
2. 安装依赖 (`bun install`)
3. 运行测试 (`bun test`)
4. 生成覆盖率报告
5. 测试失败时通知开发者

### 测试失败处理

- 测试失败时 CI 构建失败
- 开发者收到通知
- 修复问题后重新提交

## 测试维护

### 添加新测试

1. 在对应目录创建 `.test.js` 文件
2. 导入测试框架和被测模块
3. 编写测试用例
4. 运行测试验证

### 更新现有测试

1. 修改测试文件
2. 运行测试验证
3. 确保所有测试通过

### 删除过时测试

1. 删除测试文件或测试用例
2. 运行测试确保没有遗漏

## 常见问题

### Q: 测试运行很慢怎么办？
A: 
- 减少属性测试的 `numRuns` 参数
- 使用 `test.only()` 只运行特定测试
- 优化测试中的异步操作

### Q: 如何调试测试？
A:
- 使用 `console.log()` 输出调试信息
- 使用 `test.only()` 隔离问题测试
- 检查临时文件内容

### Q: 测试覆盖率不足怎么办？
A:
- 识别未覆盖的代码
- 添加针对性的测试用例
- 使用属性测试增加覆盖面

## 参考资料

- [Bun Test 文档](https://bun.sh/docs/cli/test)
- [fast-check 文档](https://fast-check.dev/)
- [测试最佳实践](https://github.com/goldbergyoni/javascript-testing-best-practices)
