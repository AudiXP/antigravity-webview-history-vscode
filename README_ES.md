# Antigravity Webview History & Resume

<p align="center">
  <b>🌐 Idioma / Language:</b>
  <a href="README.md"><b>English</b></a> |
  <a href="README_ES.md"><b>Español</b></a>
</p>

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/AudiXP/antigravity-webview-history-vscode?style=social)](https://github.com/AudiXP/antigravity-webview-history-vscode)
[![Release](https://img.shields.io/github/v/release/AudiXP/antigravity-webview-history-vscode?color=emerald)](https://github.com/AudiXP/antigravity-webview-history-vscode/releases)

**Explora, busca, reanuda y exporta tus conversaciones de IA en Antigravity — directamente desde tu IDE.**

> *Nunca más pierdas una solución brillante, un análisis de depuración o una conversación huérfana.*

---

![Vista General del Dashboard](docs/screenshots/dashboard.png)

---

## 🌟 Características Principales

### ⚡ ▶ Reanudación de Chat con 1 Clic (*Exclusivo*)
* **Reanuda cualquier conversación:** Haz clic en el botón verde **`▶ Reanudar`** en cualquier tarjeta de chat para reactivar esa conversación inmediatamente.
* **Resuelve las conversaciones huérfanas:** Indexa y activa en caliente (*hot-activation*) las conversaciones con carga perezosa en el buffer de memoria del Language Server local de Antigravity.
* **Enfoque automático del Agente:** Abre y enfoca instantáneamente el panel de chat interactivo de Antigravity para que continúes escribiendo exactamente donde lo dejaste.

### 📋 Dashboard Visual de Conversaciones
* Observa **todas tus conversaciones** de un vistazo en una pestaña de editor interactiva y moderna.
* Agrupa por **Fecha** o por **Espacio de Trabajo (Workspace)**.
* **Búsqueda en tiempo real** por título de conversación, tema o carpeta de trabajo.
* Metadatos enriquecidos: contador de pasos, marcas de tiempo exactas y puntos indicadores de estado.
* Navegación en un clic: abre la carpeta del proyecto en el Explorador de Windows o la carpeta de datos físicos `brain/`.

![Búsqueda y Filtro](docs/screenshots/search.png)

### 📦 Exportación de Alta Fidelidad (Markdown y JSON)
* Exporta conversaciones individuales o realiza una **exportación masiva de todo** con 1 clic.
* **Extracción con fidelidad total:** Incluye el razonamiento interno de la IA (*thinking chains*), diffs exactos de código y salidas de la terminal.
* Directorio de salida configurable y múltiples formatos disponibles (`md`, `json`, `all`).

![Exportación en Acción](docs/screenshots/export.png)

### 🔄 Caché Local Persistente y Auto-Recuperación
* Descubre y recupera automáticamente **conversaciones no indexadas** almacenadas en el disco local.
* Guarda el índice en `~/.gemini/antigravity-history/cache.json` para un **inicio instantáneo** al reiniciar el IDE.
* Totalmente compatible con la estructura de Antigravity IDE (`~/.gemini/antigravity-ide/conversations`).

### 🔒 100% Local y Seguro
* **Cero llamadas de red externas:** Se comunica estrictamente con tu Language Server local en `127.0.0.1`.
* **Seguro y no destructivo:** Nunca corrompe ni altera tus bases de datos SQLite originales.

---

## 🚀 Instalación

### Opción 1: Instalar desde archivo VSIX (Recomendado)
1. Descarga el archivo `.vsix` más reciente desde [**Releases**](https://github.com/AudiXP/antigravity-webview-history-vscode/releases).
2. En Antigravity IDE / VS Code:
   * Presiona `Ctrl+Shift+P`
   * Selecciona **Extensions: Install from VSIX...**
   * Selecciona el archivo descargado.

### Opción 2: Instalación por Línea de Comandos
```powershell
& "C:\Users\<usuario>\AppData\Local\Programs\Antigravity IDE\bin\antigravity-ide.cmd" --install-extension antigravity-webview-history-vscode-0.3.0.vsix --force
```

---

## 📖 Modo de Uso

1. Haz clic en el botón **`$(history) AG History`** en la barra de estado inferior derecha (o presiona `Ctrl+Shift+P` y ejecuta **Open Antigravity History**).
2. Se abrirá el gestor de conversaciones en una pestaña del editor.
3. Utiliza la barra de búsqueda para encontrar cualquier conversación previa.
4. Presiona **`▶ Reanudar`** para continuar conversando con el agente, o expórtala en formato **MD** o **JSON**.

---

## ⚙️ Configuración

| Opción | Por defecto | Descripción |
|---|---|---|
| `aghistory.exportPath` | `./antigravity_export` | Directorio predeterminado para las exportaciones |
| `aghistory.exportFormat` | `all` | Formato de exportación: `md`, `json` o `all` |
| `aghistory.fieldLevel` | `thinking` | Nivel de detalle: `default` (mensajes), `thinking` (+ razonamiento), o `full` (+ diffs y salidas de consola) |

---

## 🛠️ Desarrollo y Compilación desde Código Fuente

```bash
# Clonar el repositorio
git clone https://github.com/AudiXP/antigravity-webview-history-vscode.git
cd antigravity-webview-history-vscode

# Instalar dependencias
npm install

# Compilar extensión
npm run build

# Empaquetar a .vsix
npx @vscode/vsce package --no-dependencies
```

---

## 📄 Licencia

Este proyecto está bajo la Licencia Apache 2.0 — consulta el archivo [LICENSE](LICENSE) para más detalles.
