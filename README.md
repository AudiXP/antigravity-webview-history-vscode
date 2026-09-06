# Antigravity Webview History & Resume

<p align="center">
  <b>🌐 Idioma / Language:</b>
  <a href="README.md"><b>English</b></a> |
  <a href="README_ES.md"><b>Español</b></a>
</p>

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/AudiXP/antigravity-webview-history-vscode?style=social)](https://github.com/AudiXP/antigravity-webview-history-vscode)
[![Release](https://img.shields.io/github/v/release/AudiXP/antigravity-webview-history-vscode?color=emerald)](https://github.com/AudiXP/antigravity-webview-history-vscode/releases)

**Browse, search, resume, and export your Antigravity AI conversations — right inside your IDE.**

> *Never lose a brilliant solution, a debugging insight, or an orphaned conversation again.*

---

![Dashboard Overview](docs/screenshots/dashboard.png)

---

## 🌟 Key Features

### ⚡ ▶ One-Click Chat Resume (*Exclusive*)
* **Resume any conversation:** Click the green **`▶ Reanudar`** button on any chat card to instantly re-activate that conversation.
* **Solves orphaned conversations:** Automatically indexes and hot-activates lazy-loaded conversations in Antigravity's local Language Server buffer.
* **Auto-focus Agent:** Immediately opens and focuses the Antigravity Agent chat panel so you can continue typing right where you left off.

### 📋 Visual Conversation Dashboard
* See **all conversations** at a glance in an interactive, responsive editor tab.
* Group by **Date** or **Workspace**.
* **Real-time fuzzy search** by conversation title, topic, or workspace folder.
* Rich metadata: step counts, exact timestamps, and execution status indicator dots.
* One-click navigation: open the workspace folder in Explorer or open the conversation's `brain/` directory.

![Search & Filter](docs/screenshots/search.png)

### 📦 High-Fidelity Export (Markdown & JSON)
* Export individual conversations or **bulk export everything** with 1 click.
* **Full fidelity extraction:** Includes AI thinking chains (*reasoning traces*), exact code diffs, and terminal outputs.
* Configurable output directory and format options (`md`, `json`, `all`).

![Export in Action](docs/screenshots/export.png)

### 🔄 Persistent Local Cache & Auto-Recovery
* Automatically discovers and recovers **unindexed conversations** stored on disk.
* Persists conversation index in `~/.gemini/antigravity-history/cache.json` for **instant startup** after IDE restarts.
* Fully compatible with standard Antigravity directories (`~/.gemini/antigravity-ide/conversations`).

### 🔒 100% Local & Private
* **Zero external network requests:** Communicates strictly with your local Antigravity Language Server on `127.0.0.1`.
* **Safe and non-destructive:** Never corrupts or alters your original SQLite database files.

---

## 🚀 Installation

### Option 1: Install from VSIX (Recommended)
1. Download the latest `.vsix` file from [**Releases**](https://github.com/AudiXP/antigravity-webview-history-vscode/releases).
2. In Antigravity IDE / VS Code:
   * Press `Ctrl+Shift+P`
   * Select **Extensions: Install from VSIX...**
   * Choose the downloaded file.

### Option 2: Command Line Installation
```powershell
& "C:\Users\<user>\AppData\Local\Programs\Antigravity IDE\bin\antigravity-ide.cmd" --install-extension antigravity-webview-history-vscode-0.3.0.vsix --force
```

---

## 📖 Usage

1. Click the **`$(history) AG History`** button in the bottom status bar (or press `Ctrl+Shift+P` and run **Open Antigravity History**).
2. The interactive Conversation Manager will open in an editor tab.
3. Use the search bar to locate any conversation.
4. Click **`▶ Reanudar`** to continue chatting, or export your session to **MD** / **JSON**.

---

## ⚙️ Configuration Settings

| Setting | Default | Description |
|---|---|---|
| `aghistory.exportPath` | `./antigravity_export` | Default directory for exported files |
| `aghistory.exportFormat` | `all` | Export format: `md`, `json`, or `all` |
| `aghistory.fieldLevel` | `thinking` | Detail level: `default` (messages), `thinking` (+ reasoning), or `full` (+ diffs and command outputs) |

---

## 🛠️ Development & Building from Source

```bash
# Clone the repository
git clone https://github.com/AudiXP/antigravity-webview-history-vscode.git
cd antigravity-webview-history-vscode

# Install dependencies
npm install

# Compile extension
npm run build

# Package into .vsix
npx @vscode/vsce package --no-dependencies
```

---

## 📄 License

This project is licensed under the Apache 2.0 License — see the [LICENSE](LICENSE) file for details.
