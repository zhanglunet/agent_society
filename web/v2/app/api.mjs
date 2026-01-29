function requireApi() {
  const api = globalThis.API;
  if (!api) {
    throw new Error('API 未加载：请确保先加载 /web/js/api.js');
  }
  return api;
}

export async function getAgents() {
  return requireApi().getAgents();
}

export async function getOrgTree() {
  return requireApi().getOrgTree();
}

export async function getAgentConversation(agentId) {
  return requireApi().getAgentConversation(agentId);
}

export async function getAgentMessages(agentId) {
  return requireApi().getAgentMessages(agentId);
}

export async function sendMessage(toAgentId, message) {
  return requireApi().sendMessage(toAgentId, message);
}

export async function startRootNewSession() {
  return requireApi().startRootNewSession();
}
