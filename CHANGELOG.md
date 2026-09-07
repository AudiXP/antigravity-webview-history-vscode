# Changelog

All notable changes to the **Antigravity Webview History & Resume** extension will be documented in this file.

---

## [0.3.7] - 2026-09-06

### Fixed
- 🚫 **Eliminación Total de Notificaciones Nativas de VS Code**: Se suprimieron todas las llamadas a `vscode.window.showInformationMessage`, `showWarningMessage` y `showErrorMessage`. Toda la interacción (copia de IDs, exportación, alertas de workspace y avisos de rescate) se comunica de forma centralizada a través de la cápsula flotante azul (`.toast`) interna del Webview.
- 📑 **Apertura de Documentos en Pestañas Horizontales (sin divisiones)**: Los archivos exportados (`MD` y `JSON`) ahora se abren en el grupo de pestañas activo del editor como pestañas contiguas normales, eliminando la creación involuntaria de columnas divididas (`ViewColumn.Beside`).
- ♻️ **Sobreescritura Canónica sin Duplicados**: Al pulsar repetidamente `[MD]` o `[JSON]`, la extensión actualiza el archivo canónico de la conversación sin saturar el explorador con sufijos numéricos redundantes (`_2.md`, `_3.md`, `..._9.md`).
- 🎯 **Aclaración y Flujo de Reanudación Realista**: Mensajería transparente en el toast orientada a la selección rápida con `Ctrl + Y` / `openConversationHistory` o en el panel del Agente.

---

## [0.3.6] - 2026-09-06

### Added
- 🚀 **Prioridad Inmediata en Agente (`UpdateConversationAnnotations`)**: Al hacer clic en `▶ Reanudar`, se actualiza `lastUserViewTime` en el Language Server en tiempo real, garantizando que el chat reanudado salte automáticamente al puesto #1 dentro de los 3 cupos visibles en el pie del panel del Agente nativo.
- 🎨 **Mensaje Flotante en Azul VS Code**: El mensaje emergente (*toast*) superior ahora adopta un fondo azul distintivo (`#0e639c`) con borde (`#3794ff`) y tipografía blanca, mejorando el contraste visual.

### Changed
- 🧹 **Barra de Herramientas Simplificada**: Eliminado el botón innecesario `⚡ Cargar en Agente`; la activación y actualización se gestionan ahora de forma completamente automática y transparente al reanudar cualquier chat.

---

## [0.3.5] - 2026-09-06

### Added
- 📂 **Vista "Esta Carpeta" Predeterminada**: Filtra automáticamente y muestra solo las conversaciones del workspace activo actual (`vscode.workspace.workspaceFolders`), ordenadas por las más recientes primero.
- ⚡ **Botón "Cargar en Agente"**: Permite precargar y calentar en lote las conversaciones del proyecto actual hacia el Language Server para que aparezcan disponibles en el selector de chats (`Search all convos...`).
- 🔍 **Buscador Destacado con Botón Limpiar**: Barra de búsqueda a ancho completo en la parte superior con icono 🔍, tecla rápida `Esc` y botón `✕` para limpiar filtros al instante.

### Changed
- 🔄 **Reestructuración de Cabecera en 2 Niveles**: Barra de búsqueda arriba a ancho completo y fila inferior con selector de vistas (`[📂 Esta Carpeta]`, `[🕒 Todos los Recientes]`, etc.) y botones de acción.
- 📋 **Acciones Rápidas Bajo el Título**: Los botones `[▶ Reanudar]`, `[MD]`, `[JSON]`, `[ID]` ahora se ubican limpiamente debajo del título de la conversación, dejando espacio completo para títulos extensos.

### Fixed
- 🐛 **Eliminación de Alertas Solapadas**: Se suprimió la alerta nativa duplicada de VS Code en la esquina inferior derecha y se rediseñó el mensaje flotante como una píldora estilizada centrada en la parte superior del webview.

---

## [0.3.4] - 2026-09-06

### Fixed
- 🔄 **Sincronización Multi-Directorio**: Sincronización automática de archivos `.db` y `.pb` entre directorios duales (`~/.gemini/antigravity` y `~/.gemini/antigravity-ide`) para evitar error 500 al reanudar chats originados en versiones externas o CLI.
- 📡 **Detección de Endpoints Vacíos**: Inclusión de Language Servers activos incluso cuando reportan 0 conversaciones en memoria, permitiendo registrar ventanas recién iniciadas.
- ⚡ **Activación Broadcast**: Reanudación emitida concurrentemente a todas las instancias activas de Language Server para garantizar disponibilidad inmediata en la ventana activa.

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
