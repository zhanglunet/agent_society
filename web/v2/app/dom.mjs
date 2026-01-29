export function getEls() {
  return {
    orgList: document.getElementById('org-list'),
    tabStrip: document.getElementById('tab-strip'),
    agentList: document.getElementById('agent-list'),
    homeOrgGrid: document.getElementById('home-org-grid'),
    messageList: document.getElementById('message-list'),
    chatInput: document.getElementById('chat-input'),
    sendBtn: document.getElementById('send-btn'),
    rootNewSessionBtn: document.getElementById('root-new-session-btn'),
    orgView: document.getElementById('org-view'),
    chatView: document.getElementById('chat-view'),
    sysSettings: document.getElementById('sys-settings'),
    sysArtifacts: document.getElementById('sys-artifacts'),
    sysTemplates: document.getElementById('sys-templates'),
    sysModules: document.getElementById('sys-modules'),
  };
}

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
