/**
 * Panel Manager — creates and manages the Webview Panel for conversation browsing.
 *
 * Architecture: Editor Tab (Webview Panel) triggered by status bar button or command.
 * Same pattern as "Antigravity Auto Accept: Control Panel".
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { discoverAndListAll, getAllTrajectories, getTrajectorySteps, callApi, TrajectorySummary } from './ls-client.js';
import { recoverUnindexed, syncCascadeFiles, syncAllConversations } from './recovery.js';
import { readCache, writeCache } from './cache.js';
import { parseSteps, FieldLevel } from './parser.js';
import {
  formatMarkdown,
  buildConversationRecord,
  formatJson,
  writeConversation,
  safeFilename,
} from './formatter.js';

let currentPanel: vscode.WebviewPanel | undefined;
let currentSidebarView: vscode.WebviewView | undefined;
let cachedEndpointMap: Record<string, { port: number; csrf: string }> = {};
let cachedConversations: Record<string, TrajectorySummary> = {};

export function openPanel(context: vscode.ExtensionContext): void {
  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.One);
    return;
  }

  currentPanel = vscode.window.createWebviewPanel(
    'aghistory.panel',
    'Antigravity History',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview'),
      ],
    },
  );

  currentPanel.webview.html = getWebviewHtml(currentPanel.webview, context.extensionUri);

  currentPanel.onDidDispose(() => {
    currentPanel = undefined;
  }, null, context.subscriptions);

  setupWebviewMessageHandler(currentPanel.webview, context.subscriptions);
}

export function registerSidebarViewProvider(context: vscode.ExtensionContext): void {
  const provider: vscode.WebviewViewProvider = {
    resolveWebviewView(webviewView: vscode.WebviewView) {
      currentSidebarView = webviewView;
      webviewView.webview.options = {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview'),
        ],
      };

      webviewView.webview.html = getWebviewHtml(webviewView.webview, context.extensionUri);

      webviewView.onDidDispose(() => {
        currentSidebarView = undefined;
      });

      setupWebviewMessageHandler(webviewView.webview, context.subscriptions);

      // Load initial cached conversations
      handleRefresh(webviewView.webview);
    },
  };

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('aghistory.sidebarView', provider),
  );
}

function setupWebviewMessageHandler(webview: vscode.Webview, subscriptions: vscode.Disposable[]): void {
  webview.onDidReceiveMessage(
    async (message) => {
      switch (message.command) {
        case 'refresh':
          await handleRefresh(webview);
          break;
        case 'rescueOrphans':
          await handleRescueOrphans(webview);
          break;
        case 'activateWorkspaceInAgent':
          await handleActivateWorkspaceInAgent();
          break;
        case 'resumeChat':
          await handleResumeChat(message.cascadeId);
          break;
        case 'export':
          await handleExport(message.cascadeId, message.format);
          break;
        case 'exportAll':
          await handleExportAll();
          break;
        case 'copyId':
          if (message.cascadeId) {
            await vscode.env.clipboard.writeText(message.cascadeId);
            postMessage({ command: 'toast', text: '📋 ID copiado al portapapeles' });
          }
          break;
        case 'openInExplorer': {
          let folderPath: string = message.path || '';
          folderPath = decodeURIComponent(folderPath.replace(/^file:\/\/\/?/i, ''));
          if (folderPath) {
            // Abrir directamente en el Explorador de Archivos de Windows (o del sistema operativo)
            vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(folderPath));
          }
          break;
        }
        case 'changeExportPath': {
          const picked = await vscode.window.showOpenDialog({
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: false,
            openLabel: 'Select Export Folder',
          });
          if (picked && picked[0]) {
            const newPath = picked[0].fsPath;
            await vscode.workspace.getConfiguration('aghistory').update('exportPath', newPath, true);
            postMessage({ command: 'setExportPath', path: newPath });
          }
          break;
        }
        case 'openExportFolder': {
          const config = vscode.workspace.getConfiguration('aghistory');
          const ep = resolveExportPath(config.get<string>('exportPath', './antigravity_export'));
          // Abrir directamente en el Explorador de Archivos de Windows
          vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(ep));
          break;
        }
      }
    },
    undefined,
    subscriptions,
  );
}

export function refreshPanel(): void {
  if (currentPanel) {
    handleRefresh(currentPanel.webview);
  } else if (currentSidebarView) {
    handleRefresh(currentSidebarView.webview);
  } else {
    handleRefresh();
  }
}

export function rescueOrphansPanel(): void {
  if (currentPanel) {
    handleRescueOrphans(currentPanel.webview);
  } else if (currentSidebarView) {
    handleRescueOrphans(currentSidebarView.webview);
  } else {
    handleRescueOrphans();
  }
}

// ── Handlers ──

function sendConversationsToWebview(targetWebview?: vscode.Webview): void {
  const ws = vscode.workspace.workspaceFolders?.[0];
  const activeWorkspace = ws ? path.resolve(ws.uri.fsPath).toLowerCase() : '';
  const activeWorkspaceName = ws ? ws.name : '';

  postMessage({
    command: 'setConversations',
    data: cachedConversations,
    convDir: getConvDir(),
    activeWorkspace,
    activeWorkspaceName,
  }, targetWebview);
}

async function handleRefresh(targetWebview?: vscode.Webview): Promise<void> {
  try {
    // Step 0: Show cached data instantly (IDE restart scenario)
    const cached = readCache();
    if (Object.keys(cached).length > 0 && Object.keys(cachedConversations).length === 0) {
      cachedConversations = cached;
      sendConversationsToWebview(targetWebview);
    }

    // Step 1: Discover LS instances and get indexed conversations
    const result = await discoverAndListAll();
    cachedEndpointMap = result.cascadeToEndpoint;
    cachedConversations = { ...cachedConversations, ...result.conversations };

    sendConversationsToWebview(targetWebview);

    // Send current export path to webview
    const exportDir = resolveExportPath(
      vscode.workspace.getConfiguration('aghistory').get<string>('exportPath', './antigravity_export'),
    );
    postMessage({ command: 'setExportPath', path: exportDir }, targetWebview);

    // Step 2: Auto-recover unindexed conversations
    if (result.endpoints.length > 0) {
      const indexedIds = new Set(Object.keys(cachedConversations));
      const epList = result.endpoints.map((e) => ({ port: e.port, csrf: e.csrf }));

      const recovery = await recoverUnindexed(
        indexedIds, epList,
        (done: number, total: number) => {
          postMessage({ command: 'recoverProgress', done, total }, targetWebview);
        },
      );

      // Step 3: If we recovered anything, re-fetch the full list
      if (recovery.activated > 0) {
        const refreshed = await discoverAndListAll();
        cachedEndpointMap = refreshed.cascadeToEndpoint;
        cachedConversations = { ...cachedConversations, ...refreshed.conversations };
        sendConversationsToWebview(targetWebview);
        postMessage({ command: 'recoverDone', activated: recovery.activated, total: recovery.total }, targetWebview);
      }
    }

    // Step 4: Detect conversations cleaned by Antigravity (in cache but neither in live LS nor on disk)
    const convDirs = getConvDirs();
    const cleanedIds: string[] = [];
    for (const id of Object.keys(cachedConversations)) {
      // If it's live in LanguageServer, it is NOT cleaned
      if (result.conversations && result.conversations[id]) {
        continue;
      }
      // Check if .pb or .db exists in any conversations dir
      const existsOnDisk = convDirs.some(
        (dir) => fs.existsSync(path.join(dir, `${id}.pb`)) || fs.existsSync(path.join(dir, `${id}.db`)),
      );
      if (!existsOnDisk) {
        cleanedIds.push(id);
      }
    }
    if (cleanedIds.length > 0) {
      // Remove cleaned entries from cache
      for (const id of cleanedIds) {
        delete cachedConversations[id];
        delete cachedEndpointMap[id];
      }
      sendConversationsToWebview(targetWebview);
      postMessage({
        command: 'toast',
        text: `⚠️ ${cleanedIds.length} conversación(es) limpiadas por Antigravity (límite 100). Usa Exportar Todo para respaldar.`,
      }, targetWebview);
    }

    // Step 5: Persist to disk cache
    writeCache(cachedConversations);
  } catch (e) {
    postMessage({ command: 'error', text: `Discovery failed: ${e}` }, targetWebview);
  }
}

async function handleExport(cascadeId: string, format: string): Promise<void> {
  // Try specific endpoint first, fallback to any available endpoint
  let ep: { port: number; csrf: string } | undefined = cachedEndpointMap[cascadeId];
  if (!ep) {
    const anyId = Object.keys(cachedEndpointMap)[0];
    if (anyId) { ep = cachedEndpointMap[anyId]; }
  }
  if (!ep) {
    postMessage({ command: 'toast', text: '⚠️ No hay conexión con Language Server. Pulsa ↻' });
    return;
  }

  const config = vscode.workspace.getConfiguration('aghistory');
  const exportPath = config.get<string>('exportPath', './antigravity_export');
  const fieldLevel = config.get<string>('fieldLevel', 'thinking') as FieldLevel;
  const outputDir = resolveExportPath(exportPath);

  try {
    const steps = await getTrajectorySteps(ep.port, ep.csrf, cascadeId);
    const messages = parseSteps(steps, fieldLevel);

    // Use cached summary for title and metadata
    const cached = cachedConversations[cascadeId];
    const title = cached?.summary || `conversation_${cascadeId.slice(0, 8)}`;
    const metadata: TrajectorySummary = cached || { stepCount: steps.length };

    if (format === 'md' || format === 'all') {
      const md = formatMarkdown(title, cascadeId, metadata, messages);
      const mdPath = writeConversation(md, title, outputDir, '.md', undefined, true);
      postMessage({ command: 'toast', text: `Exportado: ${path.basename(mdPath)} 📝` });
      try {
        const doc = await vscode.workspace.openTextDocument(mdPath);
        await vscode.window.showTextDocument(doc, { preview: false });
      } catch {
        // ignore
      }
    }
    if (format === 'json' || format === 'all') {
      const record = buildConversationRecord(cascadeId, title, metadata, messages);
      const jsonStr = formatJson([record]);
      const jsonPath = writeConversation(jsonStr, title, outputDir, '.json', undefined, true);
      postMessage({ command: 'toast', text: `Exportado: ${path.basename(jsonPath)} ⚙️` });
      try {
        const doc = await vscode.workspace.openTextDocument(jsonPath);
        await vscode.window.showTextDocument(doc, { preview: false });
      } catch {
        // ignore
      }
    }
  } catch (e) {
    postMessage({ command: 'toast', text: `⚠️ Error de exportación: ${e}` });
  }
}

async function handleExportAll(): Promise<void> {
  const cascadeIds = Object.keys(cachedConversations);
  if (cascadeIds.length === 0) {
    postMessage({ command: 'toast', text: '⚠️ No hay conversaciones para exportar. Pulsa ↻ primero.' });
    return;
  }

  const config = vscode.workspace.getConfiguration('aghistory');
  const exportFormat = config.get<string>('exportFormat', 'md');
  const fieldLevel = config.get<string>('fieldLevel', 'thinking') as FieldLevel;
  const exportPath = config.get<string>('exportPath', './antigravity_export');
  const outputDir = resolveExportPath(exportPath);

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Exportando conversaciones',
      cancellable: true,
    },
    async (progress, token) => {
      let done = 0;
      const total = cascadeIds.length;

      for (const cid of cascadeIds) {
        if (token.isCancellationRequested) { break; }

        progress.report({
          message: `${done + 1} / ${total}`,
          increment: (1 / total) * 100,
        });

        try {
          const ep = cachedEndpointMap[cid] || Object.values(cachedEndpointMap)[0];
          if (ep) {
            const steps = await getTrajectorySteps(ep.port, ep.csrf, cid);
            const messages = parseSteps(steps, fieldLevel);
            const cached = cachedConversations[cid];
            const title = cached?.summary || `conversation_${cid.slice(0, 8)}`;
            const metadata: TrajectorySummary = cached || { stepCount: steps.length };

            if (exportFormat === 'md' || exportFormat === 'all') {
              const md = formatMarkdown(title, cid, metadata, messages);
              writeConversation(md, title, outputDir, '.md', undefined, true);
            }
            if (exportFormat === 'json' || exportFormat === 'all') {
              const record = buildConversationRecord(cid, title, metadata, messages);
              writeConversation(formatJson([record]), title, outputDir, '.json', undefined, true);
            }
          }
        } catch {
          // Skip failed exports silently
        }
        done++;
      }

      postMessage({
        command: 'toast',
        text: `📦 Exportación finalizada: ${done} conversaciones en ${path.basename(outputDir)} ✅`,
      });
    },
  );
}

// ── Helpers ──

async function handleRescueOrphans(targetWebview?: vscode.Webview): Promise<void> {
  try {
    postMessage({ command: 'toast', text: '🔍 Buscando y rescatando conversaciones huérfanas...' }, targetWebview);

    // Discover LS endpoints
    const discovery = await discoverAndListAll();
    cachedEndpointMap = discovery.cascadeToEndpoint;
    cachedConversations = { ...cachedConversations, ...discovery.conversations };

    if (discovery.endpoints.length === 0) {
      postMessage({ command: 'toast', text: '⚠️ No hay Language Server activo para rescatar' }, targetWebview);
      return;
    }

    // Sync all conversation files across directories before rescue
    syncAllConversations(getConvDirs());

    const indexedIds = new Set(Object.keys(cachedConversations));
    const epList = discovery.endpoints.map((e) => ({ port: e.port, csrf: e.csrf }));

    const recovery = await recoverUnindexed(
      indexedIds,
      epList,
      (done: number, total: number) => {
        postMessage({ command: 'recoverProgress', done, total }, targetWebview);
      },
      true, // forceAll: escanea y rescata todas las conversaciones en disco (.db y .pb)
    );

    // Refetch full list
    const refreshed = await discoverAndListAll();
    cachedEndpointMap = refreshed.cascadeToEndpoint;
    cachedConversations = { ...cachedConversations, ...refreshed.conversations };
    writeCache(cachedConversations);

    sendConversationsToWebview(targetWebview);
    postMessage({ command: 'recoverDone', activated: recovery.activated, total: recovery.total }, targetWebview);
    postMessage({ command: 'toast', text: `🛟 Rescate finalizado: ${recovery.activated} de ${recovery.total} reactivadas ✅` }, targetWebview);
  } catch (e) {
    postMessage({ command: 'error', text: `Rescate falló: ${e}` }, targetWebview);
  }
}

async function handleActivateWorkspaceInAgent(): Promise<void> {
  const ws = vscode.workspace.workspaceFolders?.[0];
  if (!ws) {
    postMessage({ command: 'toast', text: '⚠️ No hay carpeta de workspace abierta' });
    return;
  }

  const normTarget = path.resolve(ws.uri.fsPath).toLowerCase().replace(/\\/g, '/');
  const targetIds: string[] = [];

  for (const [cid, conv] of Object.entries(cachedConversations)) {
    const rawConv = conv as Record<string, any>;
    const wsUris: string[] = [
      ...(conv.workspaces || []).map((w: { workspaceFolderAbsoluteUri?: string; gitRootAbsoluteUri?: string }) => w.workspaceFolderAbsoluteUri || w.gitRootAbsoluteUri || ''),
      ...(rawConv.trajectoryMetadata?.workspaces || []).map((w: { workspaceFolderAbsoluteUri?: string; gitRootAbsoluteUri?: string }) => w.workspaceFolderAbsoluteUri || w.gitRootAbsoluteUri || ''),
      ...(rawConv.trajectoryMetadata?.workspaceUris || []),
    ].filter(Boolean);

    const match = wsUris.some((uri) => {
      const clean = decodeURIComponent(uri.replace(/^file:\/\/\/?/i, '')).toLowerCase().replace(/\\/g, '/');
      return clean && (normTarget.includes(clean) || clean.includes(normTarget));
    });

    if (match) {
      targetIds.push(cid);
    }
  }

  if (targetIds.length === 0) {
    postMessage({ command: 'toast', text: `No hay conversaciones registradas para "${ws.name}"` });
    return;
  }

  postMessage({ command: 'toast', text: `⚡ Cargando ${targetIds.length} conversaciones de "${ws.name}" en el Agente...` });

  // 1. Sincronizar archivos a través de directorios
  for (const cid of targetIds) {
    syncCascadeFiles(cid, getConvDirs());
  }

  // 2. Obtener endpoints activos
  let endpoints: Array<{ port: number; csrf: string }> = [];
  try {
    const refreshed = await discoverAndListAll();
    cachedEndpointMap = refreshed.cascadeToEndpoint;
    cachedConversations = { ...cachedConversations, ...refreshed.conversations };
    endpoints = refreshed.endpoints;
  } catch (e) {
    console.warn('Error during activate workspace discovery:', e);
  }

  if (endpoints.length === 0) {
    postMessage({ command: 'toast', text: '⚠️ No se detectó Language Server activo' });
    return;
  }

  // 3. Ordenar por más recientes y calentar las 30 más recientes
  targetIds.sort((a, b) => {
    const ta = cachedConversations[a]?.lastUserInputTime || cachedConversations[a]?.lastModifiedTime || cachedConversations[a]?.createdTime || '';
    const tb = cachedConversations[b]?.lastUserInputTime || cachedConversations[b]?.lastModifiedTime || cachedConversations[b]?.createdTime || '';
    return tb.localeCompare(ta);
  });

  const toActivate = targetIds.slice(0, 30);
  for (const cid of toActivate) {
    for (const ep of endpoints) {
      getTrajectorySteps(ep.port, ep.csrf, cid, 1).catch(() => {});
      callApi(ep.port, ep.csrf, 'LoadTrajectory', { cascadeId: cid }, 1500).catch(() => {});
    }
  }

  const finalRefreshed = await discoverAndListAll().catch(() => null);
  if (finalRefreshed) {
    cachedEndpointMap = finalRefreshed.cascadeToEndpoint;
    cachedConversations = { ...cachedConversations, ...finalRefreshed.conversations };
    writeCache(cachedConversations);
    sendConversationsToWebview();
  }

  postMessage({ command: 'toast', text: `⚡ ${toActivate.length} conversaciones de "${ws.name}" listas en el Agente ✅` });
}

async function handleResumeChat(cascadeId: string): Promise<void> {
  if (!cascadeId) { return; }

  // 1. Sincronizar archivos del chat entre todos los directorios de conversaciones conocidos
  // para que cualquier Language Server (con --app_data_dir antigravity o antigravity-ide) pueda leerlo
  syncCascadeFiles(cascadeId, getConvDirs());

  // 2. Descubrir todos los Language Servers activos
  let allEndpoints: Array<{ port: number; csrf: string }> = [];
  try {
    const refreshed = await discoverAndListAll();
    cachedEndpointMap = refreshed.cascadeToEndpoint;
    cachedConversations = { ...cachedConversations, ...refreshed.conversations };
    allEndpoints = refreshed.endpoints;
  } catch (e) {
    console.warn('Error discovering endpoints for resume:', e);
  }

  if (allEndpoints.length === 0 && cachedEndpointMap[cascadeId]) {
    allEndpoints.push(cachedEndpointMap[cascadeId]);
  }

  // 3. Hot-activation: forzar a TODOS los Language Servers activos a cargar el chat en memoria y actualizar su última visualización
  const nowIso = new Date().toISOString();
  await Promise.all(
    allEndpoints.map(async (ep) => {
      try {
        await getTrajectorySteps(ep.port, ep.csrf, cascadeId, 1);
        await callApi(ep.port, ep.csrf, 'LoadTrajectory', { cascadeId }, 2000).catch(() => {});
        // Actualizar lastUserViewTime para posicionar este chat en el puesto #1 del Agent View
        await callApi(ep.port, ep.csrf, 'UpdateConversationAnnotations', {
          cascadeId,
          mergeAnnotations: true,
          annotations: {
            lastUserViewTime: nowIso,
          },
        }, 2000).catch(() => {});
      } catch (e) {
        console.warn(`Hot-activation error on port ${ep.port}:`, e);
      }
    }),
  );

  // 4. Copy cascadeId to clipboard for convenient reference
  try {
    await vscode.env.clipboard.writeText(cascadeId);
  } catch {
    // ignore
  }

  // 5. Open Antigravity Agent chat panel
  try {
    await vscode.commands.executeCommand('antigravity.openChatView');
  } catch {
    // fallback
  }

  // 6. Open native conversation picker (where this chat is now top of the Recent list)
  try {
    await vscode.commands.executeCommand('openConvoPicker');
  } catch {
    try {
      await vscode.commands.executeCommand('openConversationPicker');
    } catch {
      // ignore
    }
  }

  // 7. Opción A: Simulación de confirmación automática de teclado
  setTimeout(async () => {
    try {
      await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
    } catch {
      // fallback
    }
    try {
      await vscode.commands.executeCommand('openTrajectory');
    } catch {
      // fallback
    }
  }, 200);

  setTimeout(async () => {
    try {
      await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
    } catch {
      // fallback
    }
  }, 450);

  // 8. Verificar correspondencia de workspace
  const conv = cachedConversations[cascadeId];
  const convWsUri = conv?.workspaces?.[0]?.workspaceFolderAbsoluteUri;
  const currentFolders = (vscode.workspace.workspaceFolders || []).map((f) => path.resolve(f.uri.fsPath).toLowerCase());

  let isDifferentWs = false;
  let targetFolder = '';
  if (convWsUri) {
    try {
      targetFolder = vscode.Uri.parse(convWsUri).fsPath;
    } catch {
      targetFolder = decodeURIComponent(convWsUri.replace(/^file:\/\/\//i, ''));
    }
    const normalizedTarget = path.resolve(targetFolder).toLowerCase();
    isDifferentWs = currentFolders.length > 0 && !currentFolders.some((f) => f === normalizedTarget);
  }

  if (isDifferentWs && targetFolder) {
    const folderName = path.basename(targetFolder);
    postMessage({ command: 'toast', text: `⚠️ Chat reactivado. Pertenece al proyecto "${folderName}"` });
  } else {
    postMessage({ command: 'toast', text: 'Chat reactivado en memoria ✅ Ábrelo con Ctrl+Y o en el Agente' });
  }
}

function postMessage(msg: Record<string, unknown>, targetWebview?: vscode.Webview): void {
  if (targetWebview) {
    targetWebview.postMessage(msg);
  }
  currentPanel?.webview.postMessage(msg);
  currentSidebarView?.webview.postMessage(msg);
}

function resolveExportPath(configPath: string): string {
  if (path.isAbsolute(configPath)) { return configPath; }
  const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  return path.resolve(wsFolder || process.cwd(), configPath);
}

function getConvDirs(): string[] {
  const dirs = [
    path.join(os.homedir(), '.gemini', 'antigravity-ide', 'conversations'),
    path.join(os.homedir(), '.gemini', 'antigravity', 'conversations'),
  ];
  return dirs.filter((d) => fs.existsSync(d));
}

function getConvDir(): string {
  const dirs = getConvDirs();
  return dirs[0] || path.join(os.homedir(), '.gemini', 'antigravity-ide', 'conversations');
}

function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const cssUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'panel.css'),
  );
  const jsUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'panel.js'),
  );
  const nonce = crypto.randomBytes(16).toString('hex');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${cssUri}">
  <title>Antigravity History</title>
</head>
<body>
  <div class="header-container">
    <div class="search-section">
      <div class="search-box">
        <span class="search-icon">🔍</span>
        <input type="text" class="search-input" id="search-input" placeholder="Buscar conversaciones por título, ID o workspace... (Esc para limpiar)">
        <button class="search-clear-btn" id="search-clear" title="Limpiar búsqueda" style="display:none;">✕</button>
      </div>
    </div>
    <div class="toolbar-section">
      <div class="toolbar-left">
        <div class="segmented-control">
          <button class="seg-btn active" id="group-current-ws" title="Conversaciones del workspace abierto actualmente">📂 Esta Carpeta</button>
          <button class="seg-btn" id="group-recent" title="Todas las conversaciones ordenadas por recientes">🕒 Todos los Recientes</button>
          <button class="seg-btn" id="group-date" title="Agrupadas por fecha">📅 Por Fecha</button>
          <button class="seg-btn" id="group-workspace" title="Agrupadas por workspace">📁 Por Proyecto</button>
        </div>
        <div class="segmented-control expand-collapse-ctrl">
          <button class="seg-btn" id="btn-expand-all" title="Desplegar todos los grupos">▾</button>
          <button class="seg-btn" id="btn-collapse-all" title="Colapsar todos los grupos">▸</button>
        </div>
      </div>
      <div class="toolbar-right">
        <button class="btn btn-rescue" id="btn-rescue" title="Escanear y sincronizar bases de datos huérfanas en disco">🛟 Rescatar</button>
        <button class="btn btn-icon" id="btn-refresh" title="Actualizar">↻</button>
        <button class="btn btn-primary" id="btn-export-all" title="Exportar todas las conversaciones">📦 Exportar Todo</button>
      </div>
    </div>
  </div>
  <div class="stats-bar" id="stats-bar"></div>
  <div class="export-path-bar" id="export-path-bar"></div>
  <div id="list-container"></div>
  <div class="toast" id="toast"></div>
  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
}
