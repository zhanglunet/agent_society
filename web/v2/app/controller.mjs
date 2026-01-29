import * as api from './api.mjs';
import { getEls } from './dom.mjs';
import { buildOrgsFromOrgTree, getOrgIdFromTabId } from './org.mjs';
import { createState, setAgents, setOrgData } from './state.mjs';
import { appendChatMessage, initChat, setChatAgent, setChatMessages } from './chat.mjs';
import ArtifactManager from '../../js/components/artifact-manager.mjs';
import {
  renderAgentList,
  renderHomeOrgGrid,
  renderOrgList,
  renderTabs,
} from './render.mjs';

const HOME_ORG_VIEW_ID = '__view_org__';

function applyMainViewVisibility(els, activeView) {
  if (!els.orgView || !els.chatView) return;
  const isOrg = activeView === 'org';
  els.orgView.classList.toggle('hidden', !isOrg);
  els.chatView.classList.toggle('hidden', isOrg);
}

function getVisibleMessagesForTab(state, agentId, messages) {
  if (agentId !== 'user') return messages;
  if (state.activeTabId === 'home') return messages;

  const orgId = getOrgIdFromTabId(state.activeTabId);
  if (!orgId) return [];

  const memberIds = state.orgMemberIdsByOrgId.get(orgId);
  const allowedPeerIds = new Set(Array.isArray(memberIds) ? memberIds : []);
  allowedPeerIds.add(orgId);
  allowedPeerIds.delete('user');

  return messages.filter(m => {
    if (!m) return false;
    if (m.from === 'user' && allowedPeerIds.has(m.to)) return true;
    if (m.to === 'user' && allowedPeerIds.has(m.from)) return true;
    return false;
  });
}

function getSidebarItems(state) {
  const items = [];

  if (state.activeTabId === 'home') {
    items.push({ type: 'view', id: HOME_ORG_VIEW_ID, title: '组织', meta: '组织总览', icon: '🏢' });
    if (state.agentsById.has('user')) items.push({ type: 'agent', id: 'user' });
    if (state.agentsById.has('root')) items.push({ type: 'agent', id: 'root' });
    return items;
  }

  if (state.agentsById.has('user')) items.push({ type: 'agent', id: 'user' });
  const orgId = getOrgIdFromTabId(state.activeTabId);
  if (!orgId) return items;
  const memberIds = state.orgMemberIdsByOrgId.get(orgId);
  if (!memberIds) return items;

  for (const id of memberIds) {
    if (id === 'root') continue;
    if (id === 'user') continue;
    items.push({ type: 'agent', id });
  }
  return items;
}

function renderShell(state, els, handlers) {
  renderTabs(state, els, handlers);
  renderOrgList(state, els, handlers);
  renderHomeOrgGrid(state, els, handlers);
  renderAgentList(state, els, getSidebarItems(state), handlers);
}

function renderAll(state, els, handlers) {
  renderShell(state, els, handlers);
}

function ensureSelectedAgent(state) {
  const remembered = state.tabSelectedAgentId.get(state.activeTabId);
  if (remembered) return remembered;

  if (state.activeTabId === 'home') {
    if (state.agentsById.has('user')) return 'user';
    if (state.agents.length) return state.agents[0].id;
    return null;
  }

  const orgId = getOrgIdFromTabId(state.activeTabId);
  if (orgId && state.agentsById.has(orgId)) return orgId;
  if (state.agentsById.has('user')) return 'user';
  return null;
}

export async function bootstrap() {
  const state = createState();
  const els = getEls();

  const handlers = {
    onOpenOrg: (orgId) => openOrgTab(state, els, handlers, orgId),
    onSelectTab: (tabId) => setActiveTab(state, els, handlers, tabId),
    onCloseTab: (tabId) => closeTab(state, els, handlers, tabId),
    onSelectAgent: (agentId) => onSelectAgent(state, els, handlers, agentId),
  };

  initChat();
  globalThis.App = globalThis.App || {};
  Object.assign(globalThis.App, {
    loadMessages: async (agentId) => {
      await refreshMessagesForAgent(state, agentId, true);
    },
    openOrgTemplatesManager: async () => {
      await globalThis.OrgTemplatesPanel?.show?.();
    },
    closeOrgTemplatesManager: () => {
      globalThis.OrgTemplatesPanel?.hide?.();
    },
    toggleOrgTemplatesManager: async () => {
      const win = document.getElementById('org-templates-window');
      const isOpen = win && !win.classList.contains('hidden');
      if (isOpen) {
        globalThis.App.closeOrgTemplatesManager();
      } else {
        await globalThis.App.openOrgTemplatesManager();
      }
    }
  });
  bindGlobalActions(els);

  await loadInitial(state);
  renderAll(state, els, handlers);

  await selectAgentForActiveTab(state, els, handlers);
  startPolling(state, els, handlers);
}

async function loadInitial(state) {
  const [agentsRes, treeRes] = await Promise.all([
    api.getAgents(),
    api.getOrgTree(),
  ]);
  setAgents(state, agentsRes.agents || []);
  const orgBuild = buildOrgsFromOrgTree(treeRes.tree);
  setOrgData(state, treeRes.tree, orgBuild.orgs, orgBuild.orgMemberIdsByOrgId);
}

async function selectAgentForActiveTab(state, els, handlers) {
  const next = ensureSelectedAgent(state);
  if (!next) return;
  await onSelectAgent(state, els, handlers, next, false);
}

async function onSelectAgent(state, els, handlers, agentId, remember = true) {
  state.selectedAgentId = agentId;
  if (remember) state.tabSelectedAgentId.set(state.activeTabId, agentId);

  if (state.activeTabId === 'home' && agentId === HOME_ORG_VIEW_ID) {
    applyMainViewVisibility(els, 'org');
    setChatAgent(null);
    setChatMessages([]);
    renderAll(state, els, handlers);
    return;
  }

  applyMainViewVisibility(els, 'chat');
  const agent = state.agentsById.get(agentId);
  if (agent) setChatAgent(agent);
  await refreshMessagesForAgent(state, agentId, true);
  renderAll(state, els, handlers);
}

function openOrgTab(state, els, handlers, orgId) {
  const tabId = `org:${orgId}`;
  const exists = state.openTabs.some(t => t.id === tabId);
  if (!exists) {
    const org = state.orgs.find(o => o.orgId === orgId);
    state.openTabs.push({ id: tabId, type: 'org', title: org?.title || orgId, orgId });
  }
  setActiveTab(state, els, handlers, tabId);
}

function setActiveTab(state, els, handlers, tabId) {
  const exists = state.openTabs.some(t => t.id === tabId);
  if (!exists) return;
  state.activeTabId = tabId;
  if (state.activeTabId !== 'home') {
    applyMainViewVisibility(els, 'chat');
  }
  renderAll(state, els, handlers);
  void selectAgentForActiveTab(state, els, handlers);
}

function closeTab(state, els, handlers, tabId) {
  if (!tabId || tabId === 'home') return;
  const idx = state.openTabs.findIndex(t => t.id === tabId);
  if (idx === -1) return;
  state.openTabs.splice(idx, 1);
  state.tabSelectedAgentId.delete(tabId);
  if (state.activeTabId === tabId) {
    const fallback = state.openTabs[Math.max(0, idx - 1)]?.id || 'home';
    state.activeTabId = fallback;
  }
  renderAll(state, els, handlers);
  void selectAgentForActiveTab(state, els, handlers);
}

function startPolling(state, els, handlers) {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = setInterval(() => void pollOnce(state, els, handlers), state.pollIntervalMs);
}

async function refreshMessagesForAgent(state, agentId, force = false) {
  if (!agentId) return;
  if (agentId === HOME_ORG_VIEW_ID) return;
  const res = await api.getAgentMessages(agentId);
  const messages = Array.isArray(res.messages) ? res.messages : [];
  const visibleMessages = getVisibleMessagesForTab(state, agentId, messages);
  const nextCount = messages.length;
  const prevCount = state.lastMessageCounts.get(agentId) || 0;

  if (force) {
    setChatMessages(visibleMessages);
    state.lastMessageCounts.set(agentId, nextCount);
    return;
  }

  if (nextCount === prevCount) {
    return;
  }

  if (nextCount < prevCount) {
    setChatMessages(visibleMessages);
    state.lastMessageCounts.set(agentId, nextCount);
    return;
  }

  const newMessages = messages.slice(prevCount);
  const visibleNewMessages = getVisibleMessagesForTab(state, agentId, newMessages);
  visibleNewMessages.forEach(m => appendChatMessage(m));
  state.lastMessageCounts.set(agentId, nextCount);
}

async function pollOnce(state, els, handlers) {
  try {
    const agentsRes = await api.getAgents();
    const newAgents = agentsRes.agents || [];
    const isNewAgent = newAgents.length !== state.agents.length;
    setAgents(state, newAgents);

    if (isNewAgent) {
      const treeRes = await api.getOrgTree();
      const orgBuild = buildOrgsFromOrgTree(treeRes.tree);
      setOrgData(state, treeRes.tree, orgBuild.orgs, orgBuild.orgMemberIdsByOrgId);
    }

    if (state.selectedAgentId) {
      try {
        await refreshMessagesForAgent(state, state.selectedAgentId, false);
      } catch {
      }
    }

    renderShell(state, els, handlers);
  } catch {
  }
}

function bindGlobalActions(els) {
  if (els.sysSettings) {
    els.sysSettings.addEventListener('click', () => {
      globalThis.LlmSettingsModal?.open?.({});
    });
  }

  if (els.sysArtifacts) {
    els.sysArtifacts.addEventListener('click', () => {
      const manager = ArtifactManager.getInstance();
      manager.show();
    });
  }

  if (els.sysTemplates) {
    els.sysTemplates.addEventListener('click', async () => {
      await globalThis.App?.toggleOrgTemplatesManager?.();
    });
  }

  if (els.sysModules) {
    els.sysModules.addEventListener('click', async () => {
      const win = document.getElementById('modules-window');
      if (!win) return;
      const isOpen = !win.classList.contains('hidden');
      if (isOpen) {
        win.classList.add('hidden');
        return;
      }
      win.classList.remove('hidden');
      await globalThis.ModulesPanel?.show?.();
    });
  }

  const modulesCloseBtn = document.getElementById('modules-close-btn');
  if (modulesCloseBtn) {
    modulesCloseBtn.addEventListener('click', () => {
      document.getElementById('modules-window')?.classList.add('hidden');
    });
  }
}
