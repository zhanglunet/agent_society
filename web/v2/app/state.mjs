export function createState() {
  return {
    agents: [],
    agentsById: new Map(),

    orgTree: null,
    orgs: [],
    orgMemberIdsByOrgId: new Map(),

    openTabs: [{ id: 'home', type: 'home', title: '首页' }],
    activeTabId: 'home',
    tabSelectedAgentId: new Map(),
    selectedAgentId: null,

    conversationByAgentId: new Map(),
    lastMessageCounts: new Map(),

    pollTimer: null,
    pollIntervalMs: 2000,
  };
}

export function setAgents(state, agents) {
  state.agents = Array.isArray(agents) ? agents : [];
  state.agentsById.clear();
  for (const a of state.agents) {
    if (a && a.id) state.agentsById.set(a.id, a);
  }
}

export function setOrgData(state, orgTree, orgs, orgMemberIdsByOrgId) {
  state.orgTree = orgTree ?? null;
  state.orgs = Array.isArray(orgs) ? orgs : [];
  state.orgMemberIdsByOrgId = orgMemberIdsByOrgId instanceof Map ? orgMemberIdsByOrgId : new Map();
}
