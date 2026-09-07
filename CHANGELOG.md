# Changelog

All notable changes to the **Antigravity Webview History & Resume** extension will be documented in this file.

---

## [0.3.3] - 2026-09-06

### Fixed
- 🐛 **Normalización de Rutas en Windows**: Corregida la comparación de URIs entre `file:///c%3A/` y `file:///c:/` usando `fsPath` y `path.resolve` para evitar falsas alertas de workspace cruzado.

---

## [0.3.2] - 2026-09-06

### Added
- 🕒 **Vista de "Recientes" Predeterminada**: Nueva pestaña en el control segmentado (`[Recientes] [Fecha] [Workspace]`), cargada por defecto al abrir la extensión y ordenada por última actividad (`lastUserInputTime`).
- 📁 **Detección de Workspaces Cruzados**: Si se intenta reanudar una conversación perteneciente a otro directorio, se alerta con opción de abrir dicha carpeta en una nueva ventana.

---

## [0.3.1] - 2026-09-06

### Added
- 🛟 **Botón "Rescatar Huérfanos"**: Botón dedicado en la barra superior (`top-bar`) y en el menú de la barra lateral para escanear y reactivar bajo demanda todas las conversaciones huérfanas en disco.
- ⚡ **Auto-Aceptación en Reanudar**: Al hacer clic en `▶ Reanudar`, se envía automáticamente la confirmación al selector rápido para abrir el chat en el Agente de Antigravity sin requerir presionar Enter.

### Fixed
- 🐛 **Soporte de Bases SQLite `.db`**: Corregido el escaneo de recuperación para incluir archivos `.db` además de los antiguos `.pb`, permitiendo detectar todas las conversaciones de Antigravity IDE.
- 🔧 **Integración con LoadTrajectory**: Inclusión de la llamada gRPC `LoadTrajectory` para pre-cargar la trayectoria activa en el servidor de lenguaje.

---

## [0.3.0] - 2026-09-06 (AudiXP Official Release)

### Added
- ⚡ **▶ One-Click Chat Resume**: Re-activate orphaned or past conversations directly back into the interactive Antigravity Agent chat panel.
- 📍 **Primary Side Bar (Activity Bar)**: Dedicated native icon and sidebar view in the left activity bar.
- 🌐 **Bilingual Documentation**: Complete English and Spanish README with instant language selector.
- 🚀 **Universal PowerShell Installer**: One-line auto-download and install with `$env:LOCALAPPDATA`.
- 💻 **Full Open-Source Backend**: Unobfuscated TypeScript backend restored and maintained by AudiXP.

### Fixed
- 🔧 **Native Windows Discovery**: Fixed WMI process discovery syntax on Windows for instantaneous Language Server detection.
- 🎨 **Activity Bar Icon**: Clean vector SVG icon with transparent background and theme-adaptive colors.
- 📁 **Multi-directory Support**: Automatic path resolution for `~/.gemini/antigravity-ide/conversations`.

---

## [0.2.1] - 2026-03-31

### Fixed
- 🐛 **Auto-Recovery Optimization**: Increased trajectory fetch depth and delay to ensure complete indexing of large conversations.

---

## [0.1.9] - 2026-03-17

### Fixed
- 🐛 **Export Stability**: Guard against race conditions during bulk export.
- 📊 **Export Metadata**: Added detailed reports and timestamps to export directories.

---

## [0.1.0] - 2026-03-14

### Added
- 🔮 **Conversation Dashboard**: Interactive editor tab grouped by date or workspace.
- 🔍 **Search & Filter**: Real-time fuzzy search by conversation title.
- 📤 **High-Fidelity Export**: Export full reasoning chains, code diffs, and command outputs to Markdown and JSON.
- 🔒 **100% Local & Private**: Direct communication with local Language Server on `127.0.0.1`.
