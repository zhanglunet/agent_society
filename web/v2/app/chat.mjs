import ArtifactManager from '../../js/components/artifact-manager.mjs';

function requireChatPanel() {
  const chatPanel = globalThis.ChatPanel;
  if (!chatPanel) {
    throw new Error('ChatPanel 未加载：请先加载 /web/js/components/chat-panel.mjs');
  }
  return chatPanel;
}

export function initChat() {
  if (globalThis.Toast && typeof globalThis.Toast.init === 'function') {
    globalThis.Toast.init();
  }
  if (globalThis.ErrorModal && typeof globalThis.ErrorModal.init === 'function') {
    globalThis.ErrorModal.init();
  }
  if (globalThis.LlmSettingsModal && typeof globalThis.LlmSettingsModal.init === 'function') {
    globalThis.LlmSettingsModal.init();
  }
  if (globalThis.ModulesPanel && typeof globalThis.ModulesPanel.init === 'function') {
    globalThis.ModulesPanel.init();
  }
  if (globalThis.OrgTemplatesPanel && typeof globalThis.OrgTemplatesPanel.init === 'function') {
    globalThis.OrgTemplatesPanel.init();
  }

  const chatPanel = requireChatPanel();
  if (typeof chatPanel.init === 'function') {
    chatPanel.init();
  }

  const artifactContainer = document.getElementById('artifact-manager');
  const artifactWindow = document.getElementById('artifact-manager-window');
  if (artifactContainer && artifactWindow && globalThis.API) {
    const manager = ArtifactManager.getInstance();
    manager.initialize({
      container: artifactContainer,
      windowEl: artifactWindow,
      api: globalThis.API,
      logger: console
    });
  }
}

export function setChatAgent(agent) {
  const chatPanel = requireChatPanel();
  chatPanel.setAgent(agent);
}

export function setChatMessages(messages) {
  const chatPanel = requireChatPanel();
  chatPanel.setMessages(messages);
}

export function appendChatMessage(message) {
  const chatPanel = requireChatPanel();
  chatPanel.appendMessage(message);
}
