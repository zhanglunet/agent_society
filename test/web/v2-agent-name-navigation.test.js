import { describe, test, expect } from 'bun:test';
import { findOrgIdForAgent } from '../../web/v2/app/controller.mjs';

function createState({ activeTabId, orgIds, memberships }) {
  const orgs = orgIds.map(orgId => ({ orgId, title: orgId }));
  const orgMemberIdsByOrgId = new Map();
  for (const [orgId, memberIds] of Object.entries(memberships)) {
    orgMemberIdsByOrgId.set(orgId, new Set(memberIds));
  }
  return { activeTabId, orgs, orgMemberIdsByOrgId };
}

describe('v2: findOrgIdForAgent', () => {
  test('优先返回当前激活 org tab 对应组织', () => {
    const state = createState({
      activeTabId: 'org:orgA',
      orgIds: ['orgA', 'orgB'],
      memberships: {
        orgA: ['orgA', 'agent1'],
        orgB: ['orgB', 'agent1'],
      },
    });
    expect(findOrgIdForAgent(state, 'agent1')).toBe('orgA');
  });

  test('非 org tab 时，返回 org 列表顺序中第一个包含该 agent 的组织', () => {
    const state = createState({
      activeTabId: 'home',
      orgIds: ['orgB', 'orgA'],
      memberships: {
        orgA: ['orgA', 'agent1'],
        orgB: ['orgB', 'agent1'],
      },
    });
    expect(findOrgIdForAgent(state, 'agent1')).toBe('orgB');
  });

  test('agent 不属于任何组织时返回 null', () => {
    const state = createState({
      activeTabId: 'org:orgA',
      orgIds: ['orgA'],
      memberships: {
        orgA: ['orgA', 'agent2'],
      },
    });
    expect(findOrgIdForAgent(state, 'agent1')).toBe(null);
  });
});

