import { escapeHtml } from './dom.mjs';
import { getOrgIdFromTabId } from './org.mjs';

export function getAgentDisplayName(agent) {
  if (!agent) return '未知';
  if (agent.customName) return agent.customName;
  if (agent.roleName) return `${agent.roleName}（${agent.id}）`;
  return agent.id;
}

export function getAgentMeta(agent) {
  if (!agent) return '';
  if (agent.id === 'user' || agent.id === 'root') return agent.id;
  const parts = [];
  if (agent.roleName) parts.push(agent.roleName);
  if (agent.status) parts.push(agent.status);
  return parts.join(' · ');
}

function normalizeMessageText(payload) {
  if (payload == null) return '';
  if (typeof payload === 'string') return payload;
  if (Array.isArray(payload)) {
    const parts = [];
    for (const item of payload) {
      if (item == null) continue;
      if (typeof item === 'string') {
        parts.push(item);
        continue;
      }
      if (typeof item === 'object') {
        if (typeof item.text === 'string') {
          parts.push(item.text);
          continue;
        }
        if (typeof item.content === 'string') {
          parts.push(item.content);
          continue;
        }
        if (typeof item.value === 'string') {
          parts.push(item.value);
          continue;
        }
      }
      parts.push(String(item));
    }
    return parts.join('\n');
  }
  if (typeof payload === 'object') {
    if (typeof payload.text === 'string') return payload.text;
    if (typeof payload.content === 'string') return payload.content;
    return JSON.stringify(payload, null, 2);
  }
  return String(payload);
}

export function renderTabs(state, els, handlers) {
  if (!els.tabStrip) return;

  const html = state.openTabs.map(tab => {
    const isActive = tab.id === state.activeTabId;
    const closable = tab.type === 'org';
    return `
      <div class="tab ${isActive ? 'active' : ''}" data-tab-id="${escapeHtml(tab.id)}">
        <div class="tab-title">${escapeHtml(tab.title)}</div>
        ${closable ? '<button class="tab-close" type="button" title="关闭">✕</button>' : ''}
      </div>
    `;
  }).join('');

  els.tabStrip.innerHTML = html;
  els.tabStrip.querySelectorAll('.tab').forEach(el => {
    const tabId = el.getAttribute('data-tab-id');
    if (!tabId) return;
    const closeBtn = el.querySelector('.tab-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        handlers.onCloseTab(tabId);
      });
    }
    el.addEventListener('click', () => handlers.onSelectTab(tabId));
  });
}

export function renderOrgList(state, els, handlers) {
  if (!els.orgList) return;

  if (!state.orgs.length) {
    els.orgList.innerHTML = '<div class="placeholder">暂无组织</div>';
    return;
  }

  const activeOrgId = getOrgIdFromTabId(state.activeTabId);
  const html = state.orgs.map(org => {
    const isActive = activeOrgId === org.orgId;
    const memberCount = state.orgMemberIdsByOrgId.get(org.orgId)?.size ?? 0;
    return `
      <div class="org-item ${isActive ? 'active' : ''}" data-org-id="${escapeHtml(org.orgId)}">
        <div class="org-icon">🏢</div>
        <div class="org-text">
          <div class="org-name">${escapeHtml(org.title)}</div>
          <div class="org-meta">成员 ${memberCount}</div>
        </div>
      </div>
    `;
  }).join('');

  els.orgList.innerHTML = html;
  els.orgList.querySelectorAll('.org-item').forEach(item => {
    item.addEventListener('click', () => {
      const orgId = item.getAttribute('data-org-id');
      if (!orgId) return;
      handlers.onOpenOrg(orgId);
    });
  });
}

export function renderHomeOrgGrid(state, els, handlers) {
  if (!els.homeOrgGrid) return;

  if (state.activeTabId !== 'home' || state.selectedAgentId !== '__view_org__') {
    els.homeOrgGrid.innerHTML = '';
    return;
  }

  if (!state.orgs.length) {
    els.homeOrgGrid.innerHTML = '<div class="placeholder">暂无组织</div>';
    return;
  }

  const cards = state.orgs.map(org => {
    return `
      <div class="home-org-card" data-org-id="${escapeHtml(org.orgId)}">
        <div class="home-org-card-icon">🏢</div>
        <div class="home-org-card-name">${escapeHtml(org.title)}</div>
      </div>
    `;
  }).join('');

  els.homeOrgGrid.innerHTML = `
    <div class="home-org-grid-title">组织列表</div>
    <div class="home-org-cards">${cards}</div>
  `;

  els.homeOrgGrid.querySelectorAll('.home-org-card').forEach(card => {
    card.addEventListener('click', () => {
      const orgId = card.getAttribute('data-org-id');
      if (!orgId) return;
      handlers.onOpenOrg(orgId);
    });
  });
}

export function renderAgentList(state, els, items, handlers) {
  if (!els.agentList) return;

  if (!items.length) {
    els.agentList.innerHTML = '<div class="placeholder">暂无智能体</div>';
    return;
  }

  const html = items.map(item => {
    const isActive = item.id === state.selectedAgentId;

    if (item.type === 'view') {
      return `
        <div class="agent-item ${isActive ? 'active' : ''}" data-agent-id="${escapeHtml(item.id)}">
          <div class="agent-icon">${escapeHtml(item.icon || '🏢')}</div>
          <div class="agent-text">
            <div class="agent-name">${escapeHtml(item.title || '')}</div>
            <div class="agent-meta">${escapeHtml(item.meta || '')}</div>
          </div>
        </div>
      `;
    }

    const agent = state.agentsById.get(item.id);
    if (!agent) return '';

    const name = getAgentDisplayName(agent);
    const meta = getAgentMeta(agent);
    const icon = agent.id === 'user' ? '👤' : (agent.id === 'root' ? '🌳' : '🤖');
    return `
      <div class="agent-item ${isActive ? 'active' : ''}" data-agent-id="${escapeHtml(agent.id)}">
        <div class="agent-icon">${icon}</div>
        <div class="agent-text">
          <div class="agent-name">${escapeHtml(name)}</div>
          <div class="agent-meta">${escapeHtml(meta)}</div>
        </div>
      </div>
    `;
  }).join('');

  els.agentList.innerHTML = html;
  els.agentList.querySelectorAll('.agent-item').forEach(item => {
    item.addEventListener('click', () => {
      const agentId = item.getAttribute('data-agent-id');
      if (!agentId) return;
      handlers.onSelectAgent(agentId);
    });
  });
}

export function renderChatHeader(state, els) {
  const agent = state.agentsById.get(state.selectedAgentId);
  if (els.chatAgentName) els.chatAgentName.textContent = getAgentDisplayName(agent);
  if (els.chatAgentMeta) els.chatAgentMeta.textContent = getAgentMeta(agent);
  if (els.rootNewSessionBtn) {
    els.rootNewSessionBtn.style.display = state.selectedAgentId === 'root' ? 'inline-flex' : 'none';
  }
}

export function renderMessages(state, els) {
  if (!els.messageList) return;

  const agentId = state.selectedAgentId;
  if (!agentId) {
    els.messageList.innerHTML = '<div class="placeholder">请选择一个智能体</div>';
    return;
  }

  const conv = state.conversationByAgentId.get(agentId);
  const messages = conv?.messages || [];
  if (!messages.length) {
    els.messageList.innerHTML = '<div class="placeholder">暂无消息</div>';
    return;
  }

  const html = messages.map(m => {
    const role = m.role || m.from || '';
    const cls = role === 'user' ? 'from-user' : 'from-agent';
    const text = normalizeMessageText(m.content ?? m.payload ?? m.text ?? '');
    return `
      <div class="msg-row ${cls}">
        <div class="msg-bubble">${escapeHtml(text)}</div>
      </div>
    `;
  }).join('');

  els.messageList.innerHTML = html;
  els.messageList.scrollTop = els.messageList.scrollHeight;
}
