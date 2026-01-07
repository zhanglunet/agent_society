# Requirements Document

## Introduction

本功能为智能体列表组件添加固定排序支持，确保 `user` 和 `root` 两个特殊智能体始终显示在列表顶部的固定位置，不受用户排序操作的影响。只有筛选功能可以将它们从列表中移除。

## Glossary

- **Agent_List**: 智能体列表组件，显示所有智能体并支持筛选和排序
- **Pinned_Agent**: 固定智能体，指 `user` 和 `root` 这两个特殊智能体，它们在列表中有固定位置
- **User_Agent**: 用户智能体，ID 为 `user`，始终显示在列表第一位
- **Root_Agent**: 根智能体，ID 为 `root`，始终显示在列表第二位
- **Regular_Agent**: 普通智能体，除 `user` 和 `root` 之外的所有智能体
- **Sort_Order**: 排序方向，可以是升序（asc）或降序（desc）
- **Filter_Keyword**: 筛选关键词，用于过滤智能体列表

## Requirements

### Requirement 1: 固定智能体置顶

**User Story:** As a user, I want `user` and `root` agents to always appear at the top of the agent list, so that I can quickly access these important agents.

#### Acceptance Criteria

1. WHEN the Agent_List renders, THE Agent_List SHALL display User_Agent at position 1 if it exists in the list
2. WHEN the Agent_List renders, THE Agent_List SHALL display Root_Agent at position 2 if it exists in the list
3. WHEN only User_Agent exists in the list, THE Agent_List SHALL display User_Agent at position 1
4. WHEN only Root_Agent exists in the list, THE Agent_List SHALL display Root_Agent at position 1
5. WHEN both Pinned_Agents exist, THE Agent_List SHALL display User_Agent before Root_Agent

### Requirement 2: 固定智能体不受排序影响

**User Story:** As a user, I want the pinned agents to remain at the top regardless of sort order, so that their positions are predictable.

#### Acceptance Criteria

1. WHEN Sort_Order changes from ascending to descending, THE Agent_List SHALL keep User_Agent at position 1
2. WHEN Sort_Order changes from ascending to descending, THE Agent_List SHALL keep Root_Agent at position 2 (if User_Agent exists) or position 1 (if User_Agent does not exist)
3. WHEN Sort_Order changes, THE Agent_List SHALL only reorder Regular_Agents
4. THE Agent_List SHALL apply Sort_Order only to Regular_Agents that appear after Pinned_Agents

### Requirement 3: 普通智能体正常排序

**User Story:** As a user, I want regular agents to be sorted according to my selected sort order, so that I can organize the list as needed.

#### Acceptance Criteria

1. WHEN Sort_Order is ascending, THE Agent_List SHALL sort Regular_Agents by creation time from earliest to latest
2. WHEN Sort_Order is descending, THE Agent_List SHALL sort Regular_Agents by creation time from latest to earliest
3. THE Agent_List SHALL place all sorted Regular_Agents after Pinned_Agents

### Requirement 4: 筛选功能对固定智能体生效

**User Story:** As a user, I want to filter out pinned agents when they don't match my search criteria, so that I can focus on relevant agents.

#### Acceptance Criteria

1. WHEN Filter_Keyword does not match User_Agent, THE Agent_List SHALL exclude User_Agent from the displayed list
2. WHEN Filter_Keyword does not match Root_Agent, THE Agent_List SHALL exclude Root_Agent from the displayed list
3. WHEN Filter_Keyword matches User_Agent, THE Agent_List SHALL display User_Agent at position 1
4. WHEN Filter_Keyword matches Root_Agent and User_Agent is filtered out, THE Agent_List SHALL display Root_Agent at position 1
5. WHEN Filter_Keyword is empty, THE Agent_List SHALL display all Pinned_Agents at their fixed positions
