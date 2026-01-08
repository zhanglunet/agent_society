# Requirements Document

## Introduction

Chrome 模块的页面交互功能（如点击、输入、等待元素等）在接收 CSS 选择器参数时，可能会收到被 LLM 错误包裹引号的选择器字符串（如 `"#news"` 而不是 `#news`）。这导致 Puppeteer 无法正确匹配元素，操作失败。本功能旨在对所有接收选择器参数的方法进行输入清理，确保选择器格式正确。

## Glossary

- **PageActions**: Chrome 模块中负责页面导航、内容获取和页面交互的类
- **Selector**: CSS 选择器字符串，用于定位页面元素
- **Sanitization**: 输入清理，移除选择器中多余的引号或空白字符

## Requirements

### Requirement 1: 选择器引号清理

**User Story:** As a developer using the Chrome module, I want selectors to be automatically sanitized, so that operations don't fail due to extra quotes added by LLM.

#### Acceptance Criteria

1. WHEN a selector parameter contains leading and trailing double quotes, THE PageActions SHALL remove them before using the selector
2. WHEN a selector parameter contains leading and trailing single quotes, THE PageActions SHALL remove them before using the selector
3. WHEN a selector parameter contains leading and trailing whitespace, THE PageActions SHALL trim them before using the selector
4. WHEN a selector parameter is already clean (no extra quotes or whitespace), THE PageActions SHALL use it unchanged
5. WHEN a selector contains quotes that are part of valid CSS syntax (e.g., `[data-id="test"]`), THE PageActions SHALL preserve those internal quotes

### Requirement 2: 统一清理逻辑

**User Story:** As a maintainer, I want selector sanitization to be centralized, so that all methods benefit from the same cleaning logic.

#### Acceptance Criteria

1. THE PageActions SHALL provide a private method `_sanitizeSelector` for selector cleaning
2. WHEN any method receives a selector parameter, THE method SHALL call `_sanitizeSelector` before using it
3. THE following methods SHALL apply selector sanitization: `click`, `type`, `fill`, `waitFor`, `getText`, `getContent`, `screenshot` (when selector is provided)

### Requirement 3: 错误信息改进

**User Story:** As a developer, I want clear error messages when selector operations fail, so that I can debug issues more easily.

#### Acceptance Criteria

1. WHEN a selector operation fails, THE error response SHALL include both the original selector and the sanitized selector
2. WHEN a selector is sanitized (modified), THE log output SHALL indicate the original and cleaned values
