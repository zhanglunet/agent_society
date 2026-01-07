# Implementation Plan: Agent List Pinned Sorting

## Overview

实现智能体列表的固定排序功能，确保 user 和 root 智能体始终显示在列表顶部。

## Tasks

- [x] 1. 实现 sortWithPinnedAgents 函数
  - [x] 1.1 在 SortUtils 中添加 sortWithPinnedAgents 函数
    - 分离 user、root 和普通智能体
    - 按固定顺序合并结果
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 1.2 编写属性测试：固定智能体位置正确性
    - **Property 1: 固定智能体始终在顶部且顺序正确**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**

  - [x] 1.3 编写属性测试：排序方向不影响固定智能体
    - **Property 2: 排序方向不影响固定智能体位置**
    - **Validates: Requirements 2.1, 2.2, 2.3**

  - [x] 1.4 编写属性测试：普通智能体排序正确性
    - **Property 3: 普通智能体按时间正确排序**
    - **Validates: Requirements 2.4, 3.1, 3.2, 3.3**

- [x] 2. 集成到 AgentList 组件
  - [x] 2.1 修改 applyFilterAndSort 方法使用新排序函数
    - 将 sortByCreatedAt 替换为 sortWithPinnedAgents
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 3.1, 3.2_

  - [x] 2.2 编写属性测试：筛选后固定智能体位置
    - **Property 4: 筛选后固定智能体保持相对位置**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**

- [x] 3. Checkpoint - 确保所有测试通过
  - 运行测试验证功能正确性
  - 如有问题请提出

## Notes

- 所有任务包括测试都必须完成
- 属性测试使用 fast-check 库，每个测试运行 100 次迭代
- 测试文件扩展现有的 `test/web/sort.test.js`
