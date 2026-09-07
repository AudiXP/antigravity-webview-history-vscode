// @ts-nocheck
// Antigravity History — Conversation Manager Frontend Logic

(function () {
  const vscode = acquireVsCodeApi();

  // ── DOM refs ──
  const searchInput = document.getElementById('search-input');
  const searchClearBtn = document.getElementById('search-clear');
  const rescueBtn = document.getElementById('btn-rescue');
  const refreshBtn = document.getElementById('btn-refresh');
  const exportAllBtn = document.getElementById('btn-export-all');
  const statsBar = document.getElementById('stats-bar');
  const listContainer = document.getElementById('list-container');
  const toastEl = document.getElementById('toast');
  const exportPathBar = document.getElementById('export-path-bar');
  const groupCurrentWsBtn = document.getElementById('group-current-ws');
  const groupRecentBtn = document.getElementById('group-recent');
  const groupDateBtn = document.getElementById('group-date');
  const groupWorkspaceBtn = document.getElementById('group-workspace');
  const groupArchivedBtn = document.getElementById('group-archived');
  const expandAllBtn = document.getElementById('btn-expand-all');
  const collapseAllBtn = document.getElementById('btn-collapse-all');
  const fieldLevelSelect = document.getElementById('field-level-select');

  // ── State ──
  let conversations = {};
  let searchQuery = '';
  let groupMode = 'current-ws'; // Default to current-ws!
  let collapsedGroups = new Set();
  let archivedIds = new Set();
  let wipedInIdeIds = new Set();
  let convDataDir = '';
  let currentWorkspace = '';
  let currentWorkspaceName = '';

  // ── Init ──
  if (rescueBtn) {
    rescueBtn.addEventListener('click', () => {
      rescueBtn.disabled = true;
      rescueBtn.textContent = '🛟 Rescatando...';
      vscode.postMessage({ command: 'rescueOrphans' });
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      vscode.postMessage({ command: 'refresh' });
      showLoading();
    });
  }

  if (exportAllBtn) {
    exportAllBtn.addEventListener('click', () => {
      vscode.postMessage({ command: 'exportAll' });
    });
  }

  if (fieldLevelSelect) {
    fieldLevelSelect.addEventListener('change', () => {
      vscode.postMessage({ command: 'setFieldLevel', value: fieldLevelSelect.value });
    });
  }

  if (searchClearBtn) {
    searchClearBtn.addEventListener('click', () => {
      if (searchInput) { searchInput.value = ''; }
      searchQuery = '';
      searchClearBtn.style.display = 'none';
      renderList();
      if (searchInput) { searchInput.focus(); }
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase();
      if (searchClearBtn) {
        searchClearBtn.style.display = searchQuery ? 'inline-flex' : 'none';
      }
      renderList();
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        searchInput.value = '';
        searchQuery = '';
        if (searchClearBtn) { searchClearBtn.style.display = 'none'; }
        renderList();
      }
    });
  }

  // Segmented control navigation
  function setGroupMode(mode) {
    groupMode = mode;
    [groupCurrentWsBtn, groupRecentBtn, groupDateBtn, groupWorkspaceBtn, groupArchivedBtn].forEach((b) => {
      if (b) b.classList.remove('active');
    });

    if (mode === 'current-ws' && groupCurrentWsBtn) groupCurrentWsBtn.classList.add('active');
    if (mode === 'recent' && groupRecentBtn) groupRecentBtn.classList.add('active');
    if (mode === 'date' && groupDateBtn) groupDateBtn.classList.add('active');
    if (mode === 'workspace' && groupWorkspaceBtn) groupWorkspaceBtn.classList.add('active');
    if (mode === 'archived' && groupArchivedBtn) groupArchivedBtn.classList.add('active');

    collapsedGroups.clear();
    renderList();
  }

  if (groupCurrentWsBtn) {
    groupCurrentWsBtn.addEventListener('click', () => setGroupMode('current-ws'));
  }
  if (groupRecentBtn) {
    groupRecentBtn.addEventListener('click', () => setGroupMode('recent'));
  }
  if (groupDateBtn) {
    groupDateBtn.addEventListener('click', () => setGroupMode('date'));
  }
  if (groupWorkspaceBtn) {
    groupWorkspaceBtn.addEventListener('click', () => setGroupMode('workspace'));
  }
  if (groupArchivedBtn) {
    groupArchivedBtn.addEventListener('click', () => setGroupMode('archived'));
  }

  // Expand / Collapse all
  if (expandAllBtn) {
    expandAllBtn.addEventListener('click', () => { collapsedGroups.clear(); renderList(); });
  }
  if (collapseAllBtn) {
    collapseAllBtn.addEventListener('click', () => {
      listContainer.querySelectorAll('.date-group-header').forEach((h) => {
        collapsedGroups.add(h.getAttribute('data-group'));
      });
      renderList();
    });
  }

  // ── Receive messages from extension ──
  window.addEventListener('message', (event) => {
    const msg = event.data;
    try {
      switch (msg.command) {
        case 'setConversations':
          conversations = msg.data || {};
          if (msg.convDir) { convDataDir = msg.convDir; }
          if (msg.activeWorkspace !== undefined) { currentWorkspace = msg.activeWorkspace; }
          if (msg.activeWorkspaceName !== undefined) { currentWorkspaceName = msg.activeWorkspaceName; }
          if (msg.archivedIds) { archivedIds = new Set(msg.archivedIds); }
          if (msg.wipedInIdeIds) { wipedInIdeIds = new Set(msg.wipedInIdeIds); }
          if (rescueBtn) {
            rescueBtn.disabled = false;
            rescueBtn.textContent = '🛟 Rescatar';
          }
          renderList();
          break;
        case 'recoverProgress':
          showRecoverBanner(msg.done, msg.total);
          break;
        case 'recoverDone':
          hideRecoverBanner();
          if (rescueBtn) {
            rescueBtn.disabled = false;
            rescueBtn.textContent = '🛟 Rescatar';
          }
          showToast(`Recovered ${msg.activated} conversations ✅`);
          break;
        case 'exportProgress':
          showToast(msg.text);
          break;
        case 'toast':
          showToast(msg.text);
          break;
        case 'exportDone':
          showToast(msg.text || 'Export complete ✅');
          break;
        case 'error':
          if (rescueBtn) {
            rescueBtn.disabled = false;
            rescueBtn.textContent = '🛟 Rescatar';
          }
          showError(msg.text);
          break;
        case 'setExportPath':
          if (msg.path && exportPathBar) {
            exportPathBar.innerHTML = `Export to: <span class="export-path-link" id="export-path-text" title="Click to change">${esc(msg.path)}</span> <button class="export-path-btn" id="btn-change-path">Change</button> <button class="export-path-btn" id="btn-open-path">Open</button>`;
            const btnChange = document.getElementById('btn-change-path');
            const btnOpen = document.getElementById('btn-open-path');
            const pathText = document.getElementById('export-path-text');
            if (btnChange) {
              btnChange.addEventListener('click', () => {
                vscode.postMessage({ command: 'changeExportPath' });
              });
            }
            if (btnOpen) {
              btnOpen.addEventListener('click', () => {
                vscode.postMessage({ command: 'openExportFolder' });
              });
            }
            if (pathText) {
              pathText.addEventListener('click', () => {
                vscode.postMessage({ command: 'changeExportPath' });
              });
            }
          }
          break;
      }
    } catch (err) {
      console.error('[AG History Webview] Error handling message:', err);
      showError('Render error: ' + err);
    }
  });

  // ── Workspace matcher ──
  function matchesWorkspace(info, targetWs) {
    if (!targetWs) return true;
    const normTarget = targetWs.toLowerCase().replace(/\\/g, '/');

    const wsList = [
      ...(info.workspaces || []),
      ...(info.trajectoryMetadata?.workspaces || []),
    ].map((w) => w.workspaceFolderAbsoluteUri || w.gitRootAbsoluteUri).filter(Boolean);

    if (wsList.some((uri) => {
      const clean = decodeURIComponent(uri.replace(/^file:\/\/\/?/i, '')).toLowerCase().replace(/\\/g, '/');
      return clean && (normTarget.includes(clean) || clean.includes(normTarget));
    })) {
      return true;
    }

    const uriList = info.trajectoryMetadata?.workspaceUris || [];
    if (uriList.some((uri) => {
      const clean = decodeURIComponent(uri.replace(/^file:\/\/\/?/i, '')).toLowerCase().replace(/\\/g, '/');
      return clean && (normTarget.includes(clean) || clean.includes(normTarget));
    })) {
      return true;
    }

    return false;
  }

  // ── Render ──
  function renderList() {
    const allEntries = Object.entries(conversations);

    if (allEntries.length === 0) {
      listContainer.innerHTML = getEmptyStateHtml();
      statsBar.innerHTML = '';
      return;
    }

    // Filter by search
    const searchFiltered = allEntries.filter(([_, info]) => {
      if (!searchQuery) return true;
      const title = (info.summary || '').toLowerCase();
      const wsList = [
        ...(info.workspaces || []),
        ...(info.trajectoryMetadata?.workspaces || []),
      ].map((w) => w.workspaceFolderAbsoluteUri || '').join(' ').toLowerCase();
      return title.includes(searchQuery) || wsList.includes(searchQuery);
    });

    const entries = groupMode === 'archived'
      ? searchFiltered.filter(([cid]) => archivedIds.has(cid))
      : searchFiltered.filter(([cid]) => !archivedIds.has(cid));

    const totalInWs = allEntries.filter(([cid, info]) => !archivedIds.has(cid) && matchesWorkspace(info, currentWorkspace)).length;
    const totalArchived = allEntries.filter(([cid]) => archivedIds.has(cid)).length;
    const wsDisplay = currentWorkspaceName || (currentWorkspace ? currentWorkspace.split(/[\\/]/).pop() : 'Proyecto');

    let groups;
    if (groupMode === 'archived') {
      if (entries.length === 0) {
        listContainer.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">📦</div>
            <div class="empty-state-title">No hay conversaciones archivadas</div>
            <div class="empty-state-desc">Puedes archivar cualquier conversación usando el botón <strong>📦 Archivar</strong> en su tarjeta.</div>
          </div>`;
        statsBar.innerHTML = `<span class="stat-chip active">📦 Archivados: <strong>0</strong></span> <span class="stat-chip">Total activos: ${allEntries.length - totalArchived} chats</span>`;
        return;
      }
      groups = groupByRecent(entries);
      statsBar.innerHTML = `<span class="stat-chip active">📦 Archivados: <strong>${entries.length}</strong></span> <span class="stat-chip">Total activos: ${allEntries.length - totalArchived} chats</span>`;
    } else if (groupMode === 'current-ws') {
      const wsFiltered = entries.filter(([_, info]) => matchesWorkspace(info, currentWorkspace));
      if (wsFiltered.length === 0) {
        listContainer.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">📂</div>
            <div class="empty-state-title">No hay conversaciones para ${esc(wsDisplay)}</div>
            <div class="empty-state-desc">No se encontraron conversaciones para la carpeta abierta actualmente.${searchQuery ? ' Intenta limpiar la búsqueda.' : ' Puedes consultar todas las conversaciones en la pestaña <strong>🕒 Todos los Recientes</strong>.'}</div>
          </div>`;
        statsBar.innerHTML = `<span class="stat-chip active">📂 ${esc(wsDisplay)}: <strong>0</strong> chats</span> <span class="stat-chip">Total activos: ${allEntries.length - totalArchived}</span> ${totalArchived ? `<span class="stat-chip">📦 Archivados: ${totalArchived}</span>` : ''}`;
        return;
      }
      groups = groupByRecent(wsFiltered);
      statsBar.innerHTML = `<span class="stat-chip active">📂 ${esc(wsDisplay)}: <strong>${wsFiltered.length}</strong> chats</span> <span class="stat-chip">Total activos: ${allEntries.length - totalArchived}</span> ${totalArchived ? `<span class="stat-chip">📦 Archivados: ${totalArchived}</span>` : ''}`;
    } else if (groupMode === 'workspace') {
      groups = groupByWorkspace(entries);
      statsBar.innerHTML = `<span class="stat-chip">Proyectos: <strong>${groups.size}</strong></span> <span class="stat-chip">Conversaciones: ${entries.length} de ${allEntries.length - totalArchived}</span>`;
    } else if (groupMode === 'date') {
      groups = groupByDate(entries);
      statsBar.innerHTML = `<span class="stat-chip">Periodos: <strong>${groups.size}</strong></span> <span class="stat-chip">Conversaciones: ${entries.length} de ${allEntries.length - totalArchived}</span>`;
    } else {
      // 'recent'
      groups = groupByRecent(entries);
      statsBar.innerHTML = `<span class="stat-chip active">🕒 Todos los Recientes: <strong>${entries.length}</strong></span> ${currentWorkspace ? `<span class="stat-chip">📂 En ${esc(wsDisplay)}: ${totalInWs}</span>` : ''} ${totalArchived ? `<span class="stat-chip">📦 Archivados: ${totalArchived}</span>` : ''}`;
    }

    let html = '';
    for (const [label, items] of groups) {
      const isCollapsed = collapsedGroups.has(label);
      const arrow = isCollapsed ? '▸' : '▾';
      html += `<div class="date-group">`;
      html += `<div class="date-group-header" data-group="${esc(label)}">
        <span class="group-arrow">${arrow}</span> ${esc(label)}
        <span class="date-group-count">(${items.length})</span>
      </div>`;
      html += `<div class="group-items${isCollapsed ? ' collapsed' : ''}">`;
      for (const [cid, info] of items) {
        html += renderCard(cid, info);
      }
      html += `</div></div>`;
    }
    listContainer.innerHTML = html;
    bindEvents();
  }

  function renderCard(cascadeId, info) {
    const title = info.summary || 'Untitled Conversation';
    const stepCount = info.stepCount || '?';
    const time = formatTime(info.lastUserInputTime || info.lastModifiedTime || info.createdTime);
    const status = info.status || '';
    const statusDot = getStatusDot(status);
    const isArchived = archivedIds.has(cascadeId);
    const archiveBtnText = isArchived ? '📂 Desarchivar' : '📦 Archivar';
    const archiveBtnTitle = isArchived ? 'Restaurar conversación a activos' : 'Archivar conversación';

    const workspaces = [
      ...(info.workspaces || []),
      ...(info.trajectoryMetadata?.workspaces || []),
    ].map((w) => w.workspaceFolderAbsoluteUri || w.gitRootAbsoluteUri).filter(Boolean);
    const wsPath = workspaces.length > 0 ? workspaces[0] : '';
    const wsDisplay = toWinPath(stripFileUri(wsPath));
    const wsHtml = wsPath
      ? `<span class="conv-meta-item conv-workspace" data-action="openFolder" data-path="${esc(wsPath)}" title="Abrir carpeta en Explorador">📂 ${esc(wsDisplay)}</span>`
      : '';

    const convFileHtml = convDataDir
      ? `<span class="conv-meta-item conv-id-badge" data-action="copyId" data-id="${esc(cascadeId)}" title="Copiar ID: ${esc(cascadeId)}">🪪 ${esc(cascadeId.slice(0, 8))}</span>`
      : '';

    const isWipedInIde = wipedInIdeIds.has(cascadeId);
    const wipedBadgeHtml = isWipedInIde
      ? `<span class="conv-wiped-badge" title="Borrada del historial local del IDE. Pulsa ▶ Reanudar para restituirla íntegramente desde el respaldo.">⚠️ Borrada en IDE</span>`
      : '';

    return `
      <div class="conv-card${isArchived ? ' archived' : ''}${isWipedInIde ? ' wiped-in-ide' : ''}" data-cascade-id="${esc(cascadeId)}">
        <div class="conv-icon">${statusDot}</div>
        <div class="conv-body">
          <div class="conv-header-row">
            <div class="conv-title-wrapper">
              <button class="btn-copy-title" data-action="copyTitle" data-title="${esc(title)}" title="Copiar título al portapapeles">📋</button>
              <div class="conv-title" title="${esc(title)}">${esc(title)}</div>
            </div>
            <div class="conv-header-badges">
              ${wipedBadgeHtml}
              <span class="conv-steps-badge">${stepCount} pasos</span>
            </div>
          </div>
          <div class="conv-actions-row">
            <button class="btn-action btn-resume" data-action="resumeChat" data-id="${esc(cascadeId)}" title="Reanudar en el Agente de Antigravity">▶ Reanudar</button>
            <button class="btn-action btn-format" data-action="exportMd" data-id="${esc(cascadeId)}" title="Exportar a Markdown">📝 MD</button>
            <button class="btn-action btn-format" data-action="exportJson" data-id="${esc(cascadeId)}" title="Exportar a JSON">⚙️ JSON</button>
            <button class="btn-action btn-format" data-action="copyId" data-id="${esc(cascadeId)}" title="Copiar ID de conversación">📋 ID</button>
            <button class="btn-action btn-format" data-action="toggleArchive" data-id="${esc(cascadeId)}" title="${archiveBtnTitle}">${archiveBtnText}</button>
          </div>
          <div class="conv-footer-row">
            <span class="conv-meta-item conv-time">🕒 ${time}</span>
            ${wsHtml}
            ${convFileHtml}
          </div>
        </div>
      </div>
    `;
  }

  // ── Event binding ──
  function bindEvents() {
    // Card action buttons
    listContainer.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.getAttribute('data-action');
        const cascadeId = btn.getAttribute('data-id');
        if (action === 'resumeChat') {
          vscode.postMessage({ command: 'resumeChat', cascadeId });
          showToast('Reanudando conversación en Antigravity...');
        } else if (action === 'exportMd') {
          vscode.postMessage({ command: 'export', cascadeId, format: 'md' });
          showToast('Exporting Markdown...');
        } else if (action === 'exportJson') {
          vscode.postMessage({ command: 'export', cascadeId, format: 'json' });
          showToast('Exporting JSON...');
        } else if (action === 'copyId') {
          vscode.postMessage({ command: 'copyId', cascadeId });
          showToast('Copied!');
        } else if (action === 'copyTitle') {
          const chatTitle = btn.getAttribute('data-title');
          if (chatTitle) {
            vscode.postMessage({ command: 'copyTitle', title: chatTitle });
            showToast('📋 Título copiado al portapapeles');
          }
        } else if (action === 'toggleArchive') {
          vscode.postMessage({ command: 'toggleArchive', cascadeId });
        } else if (action === 'openFolder') {
          const folderPath = btn.getAttribute('data-path');
          if (folderPath) {
            vscode.postMessage({ command: 'openInExplorer', path: folderPath });
          }
        }
      });
    });

    // Collapsible group headers
    listContainer.querySelectorAll('.date-group-header').forEach((header) => {
      header.addEventListener('click', () => {
        const group = header.getAttribute('data-group');
        if (collapsedGroups.has(group)) {
          collapsedGroups.delete(group);
        } else {
          collapsedGroups.add(group);
        }
        renderList();
      });
    });
  }

  // ── Status indicator ──
  function getStatusDot(status) {
    if (status === 'STATUS_ACTIVE' || status === 'active') return '<span class="status-dot active">●</span>';
    if (status === 'STATUS_COMPLETED' || status === 'completed') return '<span class="status-dot completed">●</span>';
    return '<span class="status-dot idle">●</span>';
  }

  // ── Grouping ──
  function groupByRecent(entries) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const thisWeek = new Date(today);
    thisWeek.setDate(thisWeek.getDate() - 7);
    const thisMonth = new Date(today);
    thisMonth.setDate(thisMonth.getDate() - 30);

    const groups = new Map();

    // Sort strictly by most recent timestamp descending
    entries.sort((a, b) => {
      const ta = a[1].lastUserInputTime || a[1].lastModifiedTime || a[1].createdTime || '';
      const tb = b[1].lastUserInputTime || b[1].lastModifiedTime || b[1].createdTime || '';
      return tb.localeCompare(ta);
    });

    for (const entry of entries) {
      const ts = entry[1].lastUserInputTime || entry[1].lastModifiedTime || entry[1].createdTime || '';
      let label = 'Anteriores';
      if (ts) {
        const d = new Date(ts);
        if (d >= today) {
          label = 'Hoy';
        } else if (d >= yesterday) {
          label = 'Ayer';
        } else if (d >= thisWeek) {
          label = 'Esta semana';
        } else if (d >= thisMonth) {
          label = 'Este mes';
        }
      }
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(entry);
    }
    return groups;
  }

  function groupByDate(entries) {
    const now = new Date();
    const todayStr = dateKey(now);
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = dateKey(yesterday);
    const groups = new Map();

    entries.sort((a, b) => {
      const ta = a[1].lastModifiedTime || a[1].createdTime || '';
      const tb = b[1].lastModifiedTime || b[1].createdTime || '';
      return tb.localeCompare(ta);
    });

    for (const entry of entries) {
      const ts = entry[1].lastModifiedTime || entry[1].createdTime || '';
      let label = 'Earlier';
      if (ts) {
        const d = dateKey(new Date(ts));
        if (d === todayStr) label = 'Today';
        else if (d === yesterdayStr) label = 'Yesterday';
        else label = d;
      }
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(entry);
    }
    return groups;
  }

  function groupByWorkspace(entries) {
    const groups = new Map();

    entries.sort((a, b) => {
      const ta = a[1].lastModifiedTime || a[1].createdTime || '';
      const tb = b[1].lastModifiedTime || b[1].createdTime || '';
      return tb.localeCompare(ta);
    });

    for (const entry of entries) {
      const ws = (entry[1].workspaces || [])
        .map((w) => w.workspaceFolderAbsoluteUri)
        .filter(Boolean);
      const label = ws.length > 0 ? toWinPath(stripFileUri(ws[0])) : 'No Workspace';
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(entry);
    }
    return groups;
  }

  // ── Time helpers ──
  function dateKey(d) { return d.toISOString().slice(0, 10); }

  function formatTime(ts) {
    if (!ts) return '–';
    try {
      const d = new Date(ts);
      const now = new Date();
      const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (dateKey(d) === dateKey(now)) return time;
      // Non-today: show date + time
      const date = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      return `${date} ${time}`;
    } catch { return ts.slice(11, 16) || '–'; }
  }

  function formatCreatedDate(ts) {
    if (!ts) return '';
    try {
      const d = new Date(ts);
      const now = new Date();
      // Only show if created date differs from today
      if (dateKey(d) === dateKey(now)) return '';
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch { return ''; }
  }

  // ── Recover banner ──
  function showRecoverBanner(done, total) {
    let banner = document.getElementById('recover-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'recover-banner';
      banner.className = 'recover-banner';
      listContainer.parentNode.insertBefore(banner, listContainer);
    }
    const pct = Math.round((done / total) * 100);
    banner.innerHTML = `
      <div class="recover-text">🔄 Syncing conversations... ${done}/${total}</div>
      <div class="recover-bar-bg"><div class="recover-bar-fill" style="width:${pct}%"></div></div>
    `;
  }

  function hideRecoverBanner() {
    const banner = document.getElementById('recover-banner');
    if (banner) {
      banner.classList.add('fade-out');
      setTimeout(() => banner.remove(), 500);
    }
  }

  // ── Empty states ──
  function getEmptyStateHtml() {
    return `<div class="empty-state">
      <div class="empty-state-icon">🔮</div>
      <div class="empty-state-title">No Conversations Found</div>
      <div class="empty-state-desc">Make sure Antigravity is running with an active workspace.</div>
      <button class="btn btn-primary" onclick="document.getElementById('btn-refresh').click()">🔄 Refresh</button>
    </div>`;
  }

  function getNoResultsHtml(query) {
    return `<div class="empty-state">
      <div class="empty-state-icon">🔍</div>
      <div class="empty-state-title">No matches for "${esc(query)}"</div>
      <div class="empty-state-desc">Try a different search term.</div>
    </div>`;
  }

  function showLoading() {
    listContainer.innerHTML = `<div class="loading"><div class="spinner"></div><div>Discovering Antigravity instances...</div></div>`;
  }

  function showError(text) {
    listContainer.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">⚠️</div>
      <div class="empty-state-title">Error</div>
      <div class="empty-state-desc">${esc(text)}</div>
      <button class="btn btn-primary" onclick="document.getElementById('btn-refresh').click()">🔄 Retry</button>
    </div>`;
  }

  // ── Toast ──
  let toastTimer;
  function showToast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2500);
  }

  // ── Utils ──
  function esc(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function stripFileUri(uri) {
    if (!uri) return '';
    return decodeURIComponent(uri.replace(/^file:\/\/\//i, ''));
  }

  function toWinPath(p) {
    if (!p) return '';
    // Forward to back slashes
    let out = p.replace(/\//g, '\\');
    // Capitalize drive letter: d:\ → D:\
    if (/^[a-z]:\\/.test(out)) {
      out = out[0].toUpperCase() + out.slice(1);
    }
    return out;
  }

  // ── Auto-refresh on load ──
  showLoading();
  vscode.postMessage({ command: 'refresh' });
})();
