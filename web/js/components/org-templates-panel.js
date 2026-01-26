const OrgTemplatesPanel = {
  templates: [],
  filteredTemplates: [],
  selectedOrgName: null,
  selectedOrgLoaded: false,
  isMaximized: false,

  panelEl: null,
  listEl: null,
  searchInput: null,
  refreshBtn: null,
  newNameInput: null,
  createBtn: null,

  currentNameEl: null,
  renameBtn: null,
  saveAllBtn: null,
  deleteBtn: null,
  saveInfoBtn: null,
  reloadOrgBtn: null,
  saveOrgBtn: null,
  infoTextarea: null,
  orgTextarea: null,

  maximizeBtn: null,
  closeBtn: null,

  init() {
    this.panelEl = document.getElementById("org-templates-window");
    this.listEl = document.getElementById("org-templates-panel-list");
    this.searchInput = document.getElementById("org-templates-panel-search");
    this.refreshBtn = document.getElementById("org-templates-panel-refresh-btn");
    this.newNameInput = document.getElementById("org-templates-panel-new-name");
    this.createBtn = document.getElementById("org-templates-panel-create-btn");

    this.currentNameEl = document.getElementById("org-templates-panel-current-name");
    this.renameBtn = document.getElementById("org-templates-panel-rename-btn");
    this.saveAllBtn = document.getElementById("org-templates-panel-save-all-btn");
    this.deleteBtn = document.getElementById("org-templates-panel-delete-btn");
    this.saveInfoBtn = document.getElementById("org-templates-panel-save-info-btn");
    this.reloadOrgBtn = document.getElementById("org-templates-panel-reload-org-btn");
    this.saveOrgBtn = document.getElementById("org-templates-panel-save-org-btn");
    this.infoTextarea = document.getElementById("org-templates-panel-info-md");
    this.orgTextarea = document.getElementById("org-templates-panel-org-md");

    this.maximizeBtn = document.getElementById("org-templates-maximize-btn");
    this.closeBtn = document.getElementById("org-templates-close-btn");

    this._bindEvents();
  },

  async show() {
    if (this.panelEl) this.panelEl.classList.remove("hidden");
    await this.loadTemplates({ autoSelectFirst: true });
  },

  hide() {
    if (this.panelEl) this.panelEl.classList.add("hidden");
    if (this.isMaximized) {
      this.setMaximized(false);
    }
  },

  async loadTemplates({ autoSelectFirst } = { autoSelectFirst: false }) {
    if (!this.listEl) return;
    this.listEl.innerHTML = '<div class="org-templates-panel-empty">加载中...</div>';
    try {
      const result = await API.getOrgTemplates();
      this.templates = Array.isArray(result?.templates) ? result.templates : [];
      this.applyFilter();

      if (this.selectedOrgName) {
        const stillExists = this.templates.some(t => t.orgName === this.selectedOrgName);
        if (!stillExists) {
          this.resetEditor();
        }
      }

      if (autoSelectFirst && !this.selectedOrgName) {
        const first = this.filteredTemplates[0]?.orgName ?? null;
        if (first) {
          await this.selectTemplate(first);
        }
      }
    } catch (err) {
      this.listEl.innerHTML = `<div class="org-templates-panel-empty">加载失败：${this._escapeHtml(err.message)}</div>`;
    }
  },

  applyFilter() {
    const q = (this.searchInput?.value || "").trim().toLowerCase();
    this.filteredTemplates = q
      ? this.templates.filter(t => (t.orgName || "").toLowerCase().includes(q) || (t.infoMd || "").toLowerCase().includes(q))
      : this.templates.slice();
    this.renderList();
  },

  renderList() {
    if (!this.listEl) return;
    if (this.filteredTemplates.length === 0) {
      this.listEl.innerHTML = '<div class="org-templates-panel-empty">没有组织模板</div>';
      return;
    }
    this.listEl.innerHTML = this.filteredTemplates.map(t => {
      const active = t.orgName === this.selectedOrgName ? " active" : "";
      const excerpt = (t.infoMd || "").replace(/\s+/g, " ").slice(0, 120);
      return `
        <div class="org-templates-panel-item${active}" data-org-name="${this._escapeHtml(t.orgName)}">
          <div class="org-templates-panel-item-name">${this._escapeHtml(t.orgName)}</div>
          <div class="org-templates-panel-item-excerpt">${this._escapeHtml(excerpt)}</div>
        </div>
      `;
    }).join("");
  },

  async selectTemplate(orgName) {
    this.selectedOrgName = orgName;
    this.selectedOrgLoaded = false;
    this.currentNameEl.textContent = orgName;

    this.renameBtn.disabled = false;
    this.deleteBtn.disabled = false;
    this.saveInfoBtn.disabled = true;
    this.saveOrgBtn.disabled = true;
    this.saveAllBtn.disabled = true;
    this.reloadOrgBtn.disabled = true;

    this.infoTextarea.value = "加载中...";
    this.infoTextarea.disabled = true;
    this.orgTextarea.value = "加载中...";
    this.orgTextarea.disabled = true;

    this.renderList();

    const [infoRes, orgRes] = await Promise.allSettled([
      API.getOrgTemplateInfo(orgName),
      API.getOrgTemplateOrg(orgName)
    ]);

    if (infoRes.status === "fulfilled") {
      this.infoTextarea.value = infoRes.value?.infoMd ?? "";
      this.infoTextarea.disabled = false;
      this.saveInfoBtn.disabled = false;
    } else {
      this.infoTextarea.value = "";
      this.infoTextarea.disabled = false;
      this.saveInfoBtn.disabled = false;
      Toast.error(`加载 info.md 失败: ${infoRes.reason?.message ?? "unknown error"}`);
    }

    if (orgRes.status === "fulfilled") {
      this.orgTextarea.value = orgRes.value?.orgMd ?? "";
      this.orgTextarea.disabled = false;
      this.saveOrgBtn.disabled = false;
      this.selectedOrgLoaded = true;
      this.saveAllBtn.disabled = false;
    } else {
      this.orgTextarea.value = "";
      this.orgTextarea.disabled = true;
      Toast.warning(`org.md 未加载：${orgRes.reason?.message ?? "unknown error"}`);
    }

    this.reloadOrgBtn.disabled = false;
  },

  async reloadOrg() {
    if (!this.selectedOrgName) return;
    this.orgTextarea.value = "加载中...";
    this.orgTextarea.disabled = true;
    this.saveOrgBtn.disabled = true;
    this.saveAllBtn.disabled = true;
    try {
      const result = await API.getOrgTemplateOrg(this.selectedOrgName);
      this.orgTextarea.value = result?.orgMd ?? "";
      this.orgTextarea.disabled = false;
      this.saveOrgBtn.disabled = false;
      this.selectedOrgLoaded = true;
      this.saveAllBtn.disabled = false;
    } catch (err) {
      this.orgTextarea.value = "";
      this.orgTextarea.disabled = true;
      Toast.error(`加载 org.md 失败: ${err.message}`);
    }
  },

  async createTemplate() {
    const orgName = (this.newNameInput.value || "").trim();
    if (!orgName) {
      Toast.warning("请输入 orgName");
      return;
    }
    try {
      await API.createOrgTemplate(orgName);
      this.newNameInput.value = "";
      Toast.success("组织模板已创建");
      await this.loadTemplates();
      await this.selectTemplate(orgName);
    } catch (err) {
      Toast.error(`创建组织模板失败: ${err.message}`);
    }
  },

  async deleteTemplate() {
    const orgName = this.selectedOrgName;
    if (!orgName) return;
    const ok = window.confirm(`确定删除组织模板 "${orgName}" 吗？该目录下的 info.md 与 org.md 将被删除。`);
    if (!ok) return;
    try {
      await API.deleteOrgTemplate(orgName);
      Toast.success("组织模板已删除");
      this.resetEditor();
      await this.loadTemplates({ autoSelectFirst: true });
    } catch (err) {
      Toast.error(`删除组织模板失败: ${err.message}`);
    }
  },

  async renameTemplate() {
    const orgName = this.selectedOrgName;
    if (!orgName) return;
    const next = window.prompt("输入新的 orgName（字母数字_-）", orgName);
    const newOrgName = (next || "").trim();
    if (!newOrgName || newOrgName === orgName) return;
    try {
      await API.renameOrgTemplate(orgName, newOrgName);
      Toast.success("已重命名");
      this.resetEditor();
      await this.loadTemplates();
      await this.selectTemplate(newOrgName);
    } catch (err) {
      Toast.error(`重命名失败: ${err.message}`);
    }
  },

  async saveInfo() {
    const orgName = this.selectedOrgName;
    if (!orgName) return;
    try {
      await API.updateOrgTemplateInfo(orgName, this.infoTextarea.value ?? "");
      Toast.success("info.md 已保存");
      await this.loadTemplates();
    } catch (err) {
      Toast.error(`保存 info.md 失败: ${err.message}`);
    }
  },

  async saveOrg() {
    const orgName = this.selectedOrgName;
    if (!orgName) return;
    if (!this.selectedOrgLoaded) {
      Toast.warning("请先加载 org.md");
      return;
    }
    try {
      await API.updateOrgTemplateOrg(orgName, this.orgTextarea.value ?? "");
      Toast.success("org.md 已保存");
    } catch (err) {
      Toast.error(`保存 org.md 失败: ${err.message}`);
    }
  },

  async saveAll() {
    const orgName = this.selectedOrgName;
    if (!orgName) return;
    if (!this.selectedOrgLoaded) {
      await this.reloadOrg();
      if (!this.selectedOrgLoaded) return;
    }
    try {
      await Promise.all([
        API.updateOrgTemplateInfo(orgName, this.infoTextarea.value ?? ""),
        API.updateOrgTemplateOrg(orgName, this.orgTextarea.value ?? "")
      ]);
      Toast.success("已保存");
      await this.loadTemplates();
    } catch (err) {
      Toast.error(`保存失败: ${err.message}`);
    }
  },

  setMaximized(max) {
    this.isMaximized = !!max;
    if (!this.panelEl) return;
    this.panelEl.classList.toggle("maximized", this.isMaximized);
    if (this.maximizeBtn) {
      this.maximizeBtn.textContent = this.isMaximized ? "🗗" : "⬜";
      this.maximizeBtn.title = "最大化/还原";
    }
  },

  _bindEvents() {
    this.refreshBtn?.addEventListener("click", () => this.loadTemplates());
    this.searchInput?.addEventListener("input", () => this.applyFilter());
    this.createBtn?.addEventListener("click", () => this.createTemplate());
    this.renameBtn?.addEventListener("click", () => this.renameTemplate());
    this.deleteBtn?.addEventListener("click", () => this.deleteTemplate());
    this.saveInfoBtn?.addEventListener("click", () => this.saveInfo());
    this.reloadOrgBtn?.addEventListener("click", () => this.reloadOrg());
    this.saveOrgBtn?.addEventListener("click", () => this.saveOrg());
    this.saveAllBtn?.addEventListener("click", () => this.saveAll());

    this.listEl?.addEventListener("click", (e) => {
      const item = e.target.closest?.(".org-templates-panel-item");
      const orgName = item?.dataset?.orgName;
      if (orgName) {
        void this.selectTemplate(orgName);
      }
    });

    this.maximizeBtn?.addEventListener("click", () => this.setMaximized(!this.isMaximized));
    this.closeBtn?.addEventListener("click", () => {
      window.App?.closeOrgTemplatesManager?.();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.isMaximized) {
        this.setMaximized(false);
      }
    });
  },

  resetEditor() {
    this.selectedOrgName = null;
    this.selectedOrgLoaded = false;
    this.currentNameEl.textContent = "-";

    this.renameBtn.disabled = true;
    this.deleteBtn.disabled = true;
    this.saveInfoBtn.disabled = true;
    this.saveOrgBtn.disabled = true;
    this.saveAllBtn.disabled = true;
    this.reloadOrgBtn.disabled = true;

    this.infoTextarea.value = "";
    this.infoTextarea.disabled = true;
    this.orgTextarea.value = "";
    this.orgTextarea.disabled = true;

    this.renderList();
  },

  _escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
  }
};

window.OrgTemplatesPanel = OrgTemplatesPanel;
