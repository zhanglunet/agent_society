const ModulePanel_Ssh = {
  apiBase: '/api/modules/ssh',
  initTimeout: 10000,
  refreshIntervalMs: 2000,
  autoRefresh: true,
  showCompleted: false,
  _refreshTimer: null,
  _isLoading: false,

  async init() {
    const autoRefreshEl = document.getElementById('ssh-auto-refresh');
    if (autoRefreshEl) {
      this.autoRefresh = !!autoRefreshEl.checked;
    }

    const showCompletedEl = document.getElementById('ssh-show-completed');
    if (showCompletedEl) {
      showCompletedEl.checked = this.showCompleted;
    }

    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('加载超时')), this.initTimeout);
      });

      await Promise.race([this.refresh(), timeoutPromise]);
    } catch (err) {
      const summary = document.getElementById('ssh-summary');
      if (summary) summary.innerHTML = `<div class="error">初始化失败: ${this.escapeHtml(err.message)}</div>`;
    }

    if (this.autoRefresh) {
      this._startAutoRefresh();
    }
  },

  toggleAutoRefresh(enabled) {
    this.autoRefresh = !!enabled;
    if (this.autoRefresh) this._startAutoRefresh();
    else this._stopAutoRefresh();
  },

  setShowCompleted(enabled) {
    this.showCompleted = !!enabled;
    void this.refresh();
  },

  async refresh() {
    if (this._isLoading) return;
    this._isLoading = true;
    try {
      const overview = await this._fetchOverview();
      if (overview?.error) {
        this._renderError(overview.message || overview.error);
        return;
      }
      this.renderOverview(overview);
    } catch (err) {
      this._renderError(err.message);
    } finally {
      this._isLoading = false;
    }
  },

  async openHosts() {
    try {
      const data = await this._fetchJson(`${this.apiBase}/hosts`);
      if (data?.error) {
        alert(`加载主机失败: ${data.message || data.error}`);
        return;
      }
      const hosts = data.hosts || [];
      if (hosts.length === 0) {
        alert('未配置可用主机');
        return;
      }
      const lines = hosts.map(h => `${h.hostName} - ${h.description || '无描述'}`).join('\n');
      alert(lines);
    } catch (err) {
      alert(`加载主机失败: ${err.message}`);
    }
  },

  async disconnect(connectionId) {
    if (!confirm('确定要断开该连接吗？')) return;
    try {
      const res = await this._fetchJson(`${this.apiBase}/connections/${encodeURIComponent(connectionId)}/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      if (res?.error) {
        alert(`断开失败: ${res.message || res.error}`);
        return;
      }

      await this.refresh();
    } catch (err) {
      alert(`断开失败: ${err.message}`);
    }
  },

  async cancelTransfer(taskId) {
    if (!confirm('确定要取消该传输任务吗？')) return;
    try {
      const res = await this._fetchJson(`${this.apiBase}/transfers/${encodeURIComponent(taskId)}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      if (res?.error) {
        alert(`取消失败: ${res.message || res.error}`);
        return;
      }

      await this.refresh();
    } catch (err) {
      alert(`取消失败: ${err.message}`);
    }
  },

  openArtifact(artifactId) {
    if (!artifactId) return;
    window.open(`/api/artifacts/${encodeURIComponent(artifactId)}`, '_blank', 'noopener,noreferrer');
  },

  async copyText(text) {
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
      }
    } catch {
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
    } finally {
      document.body.removeChild(textarea);
    }
  },

  renderOverview(data) {
    const summaryEl = document.getElementById('ssh-summary');
    const connectionsEl = document.getElementById('ssh-connections');
    const transfersEl = document.getElementById('ssh-transfers');

    const stats = data.stats || {};
    const hostsCount = stats.hostsCount ?? (data.hosts || []).length;
    const connections = data.connections || [];
    const transfers = data.transfers || [];
    const activeTransfersCount = stats.activeTransfersCount ?? transfers.filter(t => t.status === 'pending' || t.status === 'transferring').length;

    if (summaryEl) {
      summaryEl.innerHTML = `
        <div class="summary-card">
          <div class="summary-label">已配置主机</div>
          <div class="summary-value">${hostsCount}</div>
          <div class="summary-sub">仅展示主机名与描述</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">活动连接</div>
          <div class="summary-value">${connections.length}</div>
          <div class="summary-sub">可在下方断开连接</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">传输任务</div>
          <div class="summary-value">${transfers.length}</div>
          <div class="summary-sub">上传/下载任务列表</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">进行中传输</div>
          <div class="summary-value">${activeTransfersCount}</div>
          <div class="summary-sub">pending / transferring</div>
        </div>
      `;
    }

    if (connectionsEl) this.renderConnections(connectionsEl, connections);
    if (transfersEl) this.renderTransfers(transfersEl, transfers);
  },

  renderConnections(container, connections) {
    if (!connections || connections.length === 0) {
      container.innerHTML = '<div class="empty">暂无活动连接</div>';
      return;
    }

    container.innerHTML = connections.map(conn => {
      const connectionId = String(conn.connectionId || '');
      const hostName = String(conn.hostName || 'unknown');
      const status = String(conn.status || 'unknown');

      const shortId = connectionId.length > 10 ? `${connectionId.slice(0, 8)}…` : connectionId;
      const createdAt = conn.createdAt ? this.formatTime(conn.createdAt) : '-';
      const lastUsedAt = conn.lastUsedAt ? this.formatTime(conn.lastUsedAt) : '-';

      const badgeClass = status === 'connected' ? 'connected' : 'disconnected';

      return `
        <div class="item">
          <div class="item-left">
            <div class="item-title" title="${this.escapeHtml(connectionId)}">
              <span>🔗</span>
              <span>${this.escapeHtml(hostName)}</span>
              <span class="badge ${badgeClass}">${this.escapeHtml(status)}</span>
              <span class="mono" style="font-weight: 500; color:#555;">${this.escapeHtml(shortId)}</span>
            </div>
            <div class="item-meta">
              <span title="${this.escapeHtml(String(conn.createdAt || ''))}">创建: ${this.escapeHtml(createdAt)}</span>
              <span title="${this.escapeHtml(String(conn.lastUsedAt || ''))}">最近使用: ${this.escapeHtml(lastUsedAt)}</span>
            </div>
          </div>
          <div class="actions">
            <button class="secondary-btn" onclick="ModulePanel_Ssh.copyText('${this.escapeJs(connectionId)}')">复制ID</button>
            <button class="danger-btn" onclick="ModulePanel_Ssh.disconnect('${this.escapeJs(connectionId)}')">断开</button>
          </div>
        </div>
      `;
    }).join('');
  },

  renderTransfers(container, transfers) {
    if (!transfers || transfers.length === 0) {
      container.innerHTML = '<div class="empty">暂无传输任务</div>';
      return;
    }

    container.innerHTML = transfers.map(t => {
      const taskId = String(t.taskId || '');
      const type = String(t.type || '');
      const status = String(t.status || '');
      const remotePath = String(t.remotePath || '');
      const fileName = t.fileName ? String(t.fileName) : '';
      const artifactId = t.artifactId ? String(t.artifactId) : '';
      const progress = Number.isFinite(t.progress) ? Math.max(0, Math.min(100, t.progress)) : 0;
      const bytesTransferred = Number.isFinite(t.bytesTransferred) ? t.bytesTransferred : 0;
      const totalBytes = Number.isFinite(t.totalBytes) ? t.totalBytes : 0;

      const icon = type === 'download' ? '⬇️' : type === 'upload' ? '⬆️' : '📦';
      const shortTaskId = taskId.length > 10 ? `${taskId.slice(0, 8)}…` : taskId;

      const titleRight = fileName ? `${remotePath} → ${fileName}` : remotePath;
      const bytesText = totalBytes > 0 ? `${this.formatBytes(bytesTransferred)} / ${this.formatBytes(totalBytes)}` : this.formatBytes(bytesTransferred);

      const canCancel = status === 'pending' || status === 'transferring';
      const buttons = [];

      buttons.push(`<button class="secondary-btn" onclick="ModulePanel_Ssh.copyText('${this.escapeJs(taskId)}')">复制任务ID</button>`);

      if (artifactId) {
        buttons.push(`<button class="secondary-btn" onclick="ModulePanel_Ssh.openArtifact('${this.escapeJs(artifactId)}')">打开工件</button>`);
        buttons.push(`<button class="secondary-btn" onclick="ModulePanel_Ssh.copyText('${this.escapeJs(artifactId)}')">复制工件ID</button>`);
      }

      if (canCancel) {
        buttons.push(`<button class="danger-btn" onclick="ModulePanel_Ssh.cancelTransfer('${this.escapeJs(taskId)}')">取消</button>`);
      }

      const errLine = t.error ? `<span style="color:#c62828;" title="${this.escapeHtml(String(t.error))}">错误: ${this.escapeHtml(String(t.error))}</span>` : '';

      return `
        <div class="item">
          <div class="item-left">
            <div class="item-title" title="${this.escapeHtml(titleRight)}">
              <span>${icon}</span>
              <span class="mono">${this.escapeHtml(shortTaskId)}</span>
              <span class="badge ${this.escapeHtml(status)}">${this.escapeHtml(status)}</span>
              <span style="font-weight: 500; color:#555;">${this.escapeHtml(remotePath || '(无路径)')}</span>
            </div>
            <div class="item-meta">
              <span class="mono">conn: ${this.escapeHtml(String(t.connectionId || ''))}</span>
              <span>${this.escapeHtml(bytesText)}</span>
              ${fileName ? `<span title="${this.escapeHtml(fileName)}">文件名: ${this.escapeHtml(fileName)}</span>` : ''}
              ${errLine}
            </div>
            <div class="progress-row">
              <div class="progress-bar" aria-label="progress">
                <div class="progress-fill" style="width:${progress}%"></div>
              </div>
              <div class="progress-text">${progress}%</div>
            </div>
          </div>
          <div class="actions">
            ${buttons.join('')}
          </div>
        </div>
      `;
    }).join('');
  },

  _renderError(message) {
    const summaryEl = document.getElementById('ssh-summary');
    const connectionsEl = document.getElementById('ssh-connections');
    const transfersEl = document.getElementById('ssh-transfers');
    const msg = this.escapeHtml(message || '未知错误');
    if (summaryEl) summaryEl.innerHTML = `<div class="error">加载失败: ${msg}</div>`;
    if (connectionsEl) connectionsEl.innerHTML = `<div class="error">加载失败: ${msg}</div>`;
    if (transfersEl) transfersEl.innerHTML = `<div class="error">加载失败: ${msg}</div>`;
  },

  _startAutoRefresh() {
    this._stopAutoRefresh();
    this._refreshTimer = setInterval(() => {
      void this.refresh();
    }, this.refreshIntervalMs);
  },

  _stopAutoRefresh() {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
  },

  async _fetchOverview() {
    const showCompleted = this.showCompleted ? '1' : '0';
    return await this._fetchJson(`${this.apiBase}/overview?showCompleted=${showCompleted}`);
  },

  async _fetchJson(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.initTimeout);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  },

  formatTime(iso) {
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return String(iso);
      return d.toLocaleString('zh-CN', { hour12: false });
    } catch {
      return String(iso);
    }
  },

  formatBytes(bytes) {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n < 0) return '-';
    if (n < 1024) return `${n} B`;
    const kb = n / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    const gb = mb / 1024;
    return `${gb.toFixed(1)} GB`;
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
  },

  escapeJs(text) {
    return String(text == null ? '' : text)
      .replaceAll('\\', '\\\\')
      .replaceAll("'", "\\'")
      .replaceAll('\n', '\\n')
      .replaceAll('\r', '\\r');
  }
};

window.ModulePanel_Ssh = ModulePanel_Ssh;
window.SshPanel = ModulePanel_Ssh;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    void ModulePanel_Ssh.init();
  });
}
