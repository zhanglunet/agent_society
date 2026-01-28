(function () {
  function getOrCreateClientId() {
    try {
      const existing = sessionStorage.getItem("agent_society_ui_client_id");
      if (existing) return existing;
      const created = (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function")
        ? globalThis.crypto.randomUUID()
        : `ui_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      sessionStorage.setItem("agent_society_ui_client_id", created);
      return created;
    } catch {
      return `ui_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    }
  }

  function truncateText(text, maxChars) {
    const s = String(text ?? "");
    const n = Number(maxChars ?? 20000);
    if (!Number.isFinite(n) || n <= 0) return "";
    if (s.length <= n) return s;
    return s.slice(0, n) + `\n...[truncated ${s.length - n} chars]`;
  }

  function getSelectedAgentId() {
    const el = document.querySelector(".agent-item.selected");
    return el ? el.getAttribute("data-agent-id") : null;
  }

  function getActiveViewId() {
    const btn = document.querySelector(".view-toggle .toggle-btn.active");
    return btn ? btn.id : null;
  }

  async function executeEvalJs(payload) {
    const script = String(payload?.script ?? "");
    const fn = new Function(
      "window",
      "document",
      "globalThis",
      `return (async () => { ${script}\n })();`
    );
    return await fn(window, document, globalThis);
  }

  function resolveRoot(selector) {
    if (selector == null || String(selector).trim() === "") return document.documentElement;
    return document.querySelector(String(selector));
  }

  function buildSummary(root) {
    const selectedAgentId = getSelectedAgentId();
    const activeViewId = getActiveViewId();
    const messageCount = document.querySelectorAll("#message-list .message-item").length;
    const agentCount = document.querySelectorAll("#agent-list .agent-item").length;
    const roleStatsCount = document.querySelectorAll("#role-stats .role-stat-item").length;
    const rootTag = root ? root.tagName.toLowerCase() : null;
    const rootId = root ? root.id || null : null;
    const rootClasses = root ? (typeof root.className === "string" ? root.className : null) : null;

    return {
      title: document.title,
      url: location.href,
      pathname: location.pathname,
      hash: location.hash,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      selectedAgentId,
      activeViewId,
      counts: {
        agentItems: agentCount,
        messageItems: messageCount,
        roleStats: roleStatsCount
      },
      root: {
        tag: rootTag,
        id: rootId,
        className: rootClasses
      }
    };
  }

  async function executeGetContent(payload) {
    const selector = payload?.selector ?? null;
    const format = payload?.format ?? "summary";
    const maxChars = payload?.maxChars ?? 20000;

    const root = resolveRoot(selector);
    if (!root) {
      return { error: "element_not_found", selector: String(selector) };
    }

    if (format === "html") {
      return { ok: true, html: truncateText(root.outerHTML, maxChars), length: root.outerHTML.length };
    }
    if (format === "text") {
      const text = root.innerText || root.textContent || "";
      return { ok: true, text: truncateText(text, maxChars), length: text.length };
    }
    return { ok: true, summary: buildSummary(root) };
  }

  function ensureStyleTag(styleId) {
    const id = String(styleId ?? "agent_society_ui_ephemeral_style");
    let el = document.querySelector(`style[data-ui-style-id="${CSS.escape(id)}"]`);
    if (!el) {
      el = document.createElement("style");
      el.setAttribute("data-ui-style-id", id);
      document.head.appendChild(el);
    }
    return el;
  }

  async function executeDomPatch(payload) {
    const operations = Array.isArray(payload?.operations) ? payload.operations : [];
    const results = [];
    let applied = 0;
    let failed = 0;

    for (const raw of operations) {
      const op = raw?.op;
      const selector = raw?.selector;
      const value = raw?.value;
      const name = raw?.name;
      const position = raw?.position;

      try {
        if (op === "injectCss") {
          const styleEl = ensureStyleTag(name);
          styleEl.textContent = String(value ?? "");
          results.push({ ok: true, op, styleId: styleEl.getAttribute("data-ui-style-id") });
          applied += 1;
          continue;
        }

        if (!selector || typeof selector !== "string") {
          results.push({ ok: false, op, error: "missing_selector" });
          failed += 1;
          continue;
        }

        const el = document.querySelector(selector);
        if (!el) {
          results.push({ ok: false, op, selector, error: "element_not_found" });
          failed += 1;
          continue;
        }

        if (op === "setText") {
          el.textContent = String(value ?? "");
        } else if (op === "setHtml") {
          el.innerHTML = String(value ?? "");
        } else if (op === "setAttr") {
          if (!name) throw new Error("missing_attr_name");
          el.setAttribute(String(name), String(value ?? ""));
        } else if (op === "remove") {
          el.remove();
        } else if (op === "insertAdjacentHtml") {
          const pos = position ?? "beforeend";
          el.insertAdjacentHTML(pos, String(value ?? ""));
        } else if (op === "addClass") {
          el.classList.add(String(value ?? ""));
        } else if (op === "removeClass") {
          el.classList.remove(String(value ?? ""));
        } else {
          results.push({ ok: false, op, selector, error: "unknown_op" });
          failed += 1;
          continue;
        }

        results.push({ ok: true, op, selector });
        applied += 1;
      } catch (e) {
        results.push({ ok: false, op, selector: selector ?? null, error: "patch_error", message: e?.message ?? String(e) });
        failed += 1;
      }
    }

    return { ok: true, applied, failed, results };
  }

  async function executeCommand(command) {
    const type = command?.type;
    const payload = command?.payload ?? {};

    if (type === "eval_js") {
      const result = await executeEvalJs(payload);
      return { ok: true, result };
    }
    if (type === "get_content") {
      const result = await executeGetContent(payload);
      if (result && result.ok === false) return { ok: false, error: result };
      return { ok: true, result };
    }
    if (type === "dom_patch") {
      const result = await executeDomPatch(payload);
      return { ok: true, result };
    }
    return { ok: false, error: { code: "unknown_command_type", type } };
  }

  async function postResult(commandId, payload) {
    await fetch("/api/ui-commands/result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commandId, ...payload })
    });
  }

  async function pollLoop(clientId) {
    while (true) {
      try {
        const res = await fetch(`/api/ui-commands/poll?clientId=${encodeURIComponent(clientId)}&timeoutMs=25000`, {
          method: "GET",
          headers: { "Content-Type": "application/json" }
        });
        const data = await res.json();
        const command = data?.command ?? null;
        if (!command) continue;

        try {
          const result = await executeCommand(command);
          await postResult(command.id, result);
        } catch (e) {
          await postResult(command.id, { ok: false, error: { message: e?.message ?? String(e), stack: e?.stack ?? null } });
        }
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }

  const clientId = getOrCreateClientId();
  window.AgentSocietyUiTools = {
    clientId
  };
  void pollLoop(clientId);
})();

