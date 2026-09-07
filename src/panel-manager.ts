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
import { recoverUnindexed } from './recovery.js';
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
            vscode.window.showInformationMessage('Cascade ID copied!');
          }
          break;
        case 'openInExplorer': {
          let folderPath: string = message.path || '';
          folderPath = decodeURIComponent(folderPath.replace(/^file:\/\/\//i, ''));
          if (folderPath) {
            vscode.env.openExternal(vscode.Uri.file(folderPath));
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
          vscode.env.openExternal(vscode.Uri.file(ep));
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

async function handleRefresh(targetWebview?: vscode.Webview): Promise<void> {
  try {
    // Step 0: Show cached data instantly (IDE restart scenario)
    const cached = readCache();
    if (Object.keys(cached).length > 0 && Object.keys(cachedConversations).length === 0) {
      cachedConversations = cached;
      postMessage({ command: 'setConversations', data: cachedConversations, convDir: getConvDir() }, targetWebview);
    }

    // Step 1: Discover LS instances and get indexed conversations
    const result = await discoverAndListAll();
    cachedEndpointMap = result.cascadeToEndpoint;
    cachedConversations = { ...cachedConversations, ...result.conversations };

    postMessage({ command: 'setConversations', data: cachedConversations, convDir: getConvDir() }, targetWebview);

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
        postMessage({ command: 'setConversations', data: cachedConversations, convDir: getConvDir() }, targetWebview);
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
      postMessage({ command: 'setConversations', data: cachedConversations, convDir: getConvDir() }, targetWebview);
      vscode.window.showWarningMessage(
        `${cleanedIds.length} conversation(s) were auto-cleaned by Antigravity (100-limit). Consider using "Export All" to backup.`,
        'Export All',
      ).then((choice) => {
        if (choice === 'Export All') { handleExportAll(); }
      });
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
    vscode.window.showErrorMessage('No LS endpoint available. Try refreshing.');
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
      const mdPath = writeConversation(md, title, outputDir, '.md');
      postMessage({ command: 'exportDone', text: `Exported: ${path.basename(mdPath)}` });
    }
    if (format === 'json' || format === 'all') {
      const record = buildConversationRecord(cascadeId, title, metadata, messages);
      const jsonStr = formatJson([record]);
      const jsonPath = writeConversation(jsonStr, title, outputDir, '.json');
      postMessage({ command: 'exportDone', text: `Exported: ${path.basename(jsonPath)}` });
    }
  } catch (e) {
    vscode.window.showErrorMessage(`Export failed: ${e}`);
  }
}

async function handleExportAll(): Promise<void> {
  const cascadeIds = Object.keys(cachedConversations);
  if (cascadeIds.length === 0) {
    vscode.window.showWarningMessage('No conversations to export. Try refreshing first.');
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
      title: 'Exporting conversations',
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
          await handleExport(cid, exportFormat);
        } catch {
          // Skip failed exports silently
        }
        done++;
      }

      const choice = await vscode.window.showInformationMessage(
        `Exported ${done} conversations to ${outputDir}`,
        'Open Folder',
      );
      if (choice === 'Open Folder') {
        vscode.env.openExternal(vscode.Uri.file(outputDir));
      }
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
      vscode.window.showWarningMessage('No se detectó ningún Language Server de Antigravity activo.');
      postMessage({ command: 'toast', text: '⚠️ No hay Language Server activo para rescatar' }, targetWebview);
      return;
    }

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

    postMessage({ command: 'setConversations', data: cachedConversations, convDir: getConvDir() }, targetWebview);
    postMessage({ command: 'recoverDone', activated: recovery.activated, total: recovery.total }, targetWebview);
    postMessage({ command: 'toast', text: `🛟 Rescate finalizado: ${recovery.activated} conversaciones reactivadas ✅` }, targetWebview);

    vscode.window.showInformationMessage(`Rescate completado: ${recovery.activated} de ${recovery.total} conversaciones reactivadas en Antigravity.`);
  } catch (e) {
    vscode.window.showErrorMessage(`Error en rescate de huérfanos: ${e}`);
    postMessage({ command: 'error', text: `Rescate falló: ${e}` }, targetWebview);
  }
}

async function handleResumeChat(cascadeId: string): Promise<void> {
  if (!cascadeId) { return; }

  let ep = cachedEndpointMap[cascadeId];
  if (!ep) {
    try {
      const refreshed = await discoverAndListAll();
      cachedEndpointMap = refreshed.cascadeToEndpoint;
      ep = cachedEndpointMap[cascadeId];
      if (!ep && refreshed.endpoints.length > 0) {
        ep = { port: refreshed.endpoints[0].port, csrf: refreshed.endpoints[0].csrf };
      }
    } catch (e) {
      console.warn('Error refreshing endpoints for resume:', e);
    }
  }

  if (ep) {
    try {
      // 1. Hot-activation: force LanguageServer to load .db into memory buffer
      await getTrajectorySteps(ep.port, ep.csrf, cascadeId, 1);
      // Also notify LoadTrajectory if possible
      callApi(ep.port, ep.csrf, 'LoadTrajectory', { cascadeId }, 2000).catch(() => {});
    } catch (e) {
      console.warn('Hot-activation error:', e);
    }
  }

  // 2. Copy cascadeId to clipboard for convenient reference
  try {
    await vscode.env.clipboard.writeText(cascadeId);
  } catch {
    // ignore
  }

  // 3. Open Antigravity Agent chat panel
  try {
    await vscode.commands.executeCommand('antigravity.openChatView');
  } catch {
    // fallback
  }

  // 4. Open native conversation picker (where this chat is now top of the Recent list)
  try {
    await vscode.commands.executeCommand('openConvoPicker');
  } catch {
    try {
      await vscode.commands.executeCommand('openConversationPicker');
    } catch {
      // ignore
    }
  }

  // 5. Opción A: Simulación de confirmación automática de teclado
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

  // 6. Verificar correspondencia de workspace
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
    postMessage({ command: 'toast', text: `Chat reactivado ⚠️ Pertenece a "${folderName}"` });
    vscode.window.showWarningMessage(
      `Este chat pertenece al workspace "${folderName}" (${targetFolder}). El Agente de Antigravity solo lista en "Recientes" los chats de la carpeta abierta actualmente. ¿Deseas abrir esa carpeta?`,
      'Abrir en Nueva Ventana',
      'Abrir en Esta Ventana',
    ).then((choice) => {
      if (choice === 'Abrir en Nueva Ventana') {
        vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(targetFolder), true);
      } else if (choice === 'Abrir en Esta Ventana') {
        vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(targetFolder), false);
      }
    });
  } else {
    postMessage({ command: 'toast', text: `Chat en la cima de Recientes ✅ Haz clic en él en el panel del Agente` });
    vscode.window.showInformationMessage(`Conversación ${cascadeId.slice(0, 8)} reactivada en la cima de Recientes. Haz clic sobre ella abajo en el panel del Agente.`);
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
  <div class="top-bar">
    <input type="text" class="search-input" id="search-input" placeholder="Search conversations...">
    <div class="segmented-control">
      <button class="seg-btn active" id="group-recent">Recientes</button>
      <button class="seg-btn" id="group-date">Fecha</button>
      <button class="seg-btn" id="group-workspace">Workspace</button>
    </div>
    <div class="segmented-control">
      <button class="seg-btn" id="btn-expand-all" title="Expand All">▾ Expand</button>
      <button class="seg-btn" id="btn-collapse-all" title="Collapse All">▸ Collapse</button>
    </div>
    <button class="btn btn-rescue" id="btn-rescue" title="Rescatar conversaciones huérfanas en disco">🛟 Rescatar</button>
    <button class="btn btn-icon" id="btn-refresh" title="Refresh">↻</button>
    <button class="btn btn-primary" id="btn-export-all">Export All</button>
  </div>
  <div class="stats-bar" id="stats-bar"></div>
  <div class="export-path-bar" id="export-path-bar"></div>
  <div id="list-container"></div>
  <div class="toast" id="toast"></div>
  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
}
