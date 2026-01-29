function traverseTree(node, visit) {
  if (!node) return;
  visit(node);
  const children = Array.isArray(node.children) ? node.children : [];
  for (const child of children) {
    traverseTree(child, visit);
  }
}

function normalizeRootNode(tree) {
  if (!tree) return null;
  if (Array.isArray(tree)) {
    const root = tree.find(n => n && n.id === 'root');
    if (root) return root;
    return { id: '__root__', children: tree.filter(Boolean) };
  }
  if (typeof tree === 'object') {
    if (tree.id === 'root') return tree;
    return { id: '__root__', children: [tree] };
  }
  return null;
}

export function buildOrgsFromOrgTree(tree) {
  const orgs = [];
  const orgMemberIdsByOrgId = new Map();

  const root = normalizeRootNode(tree);
  const topChildren = root && Array.isArray(root.children) ? root.children : [];
  const orgRoots = topChildren.filter(n => n && n.id && n.id !== 'user' && n.id !== 'root');

  for (const node of orgRoots) {
    const orgId = node.id;
    const title = node.customName || node.roleName || orgId;
    const memberIds = new Set();
    traverseTree(node, n => {
      if (n && n.id) memberIds.add(n.id);
    });
    orgs.push({ orgId, title });
    orgMemberIdsByOrgId.set(orgId, memberIds);
  }

  orgs.sort((a, b) => String(a.title).localeCompare(String(b.title), 'zh-CN'));
  return { orgs, orgMemberIdsByOrgId };
}

export function getOrgIdFromTabId(tabId) {
  if (!tabId || !tabId.startsWith('org:')) return null;
  return tabId.slice('org:'.length) || null;
}

