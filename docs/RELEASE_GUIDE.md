# Guía de Publicación y Empaquetado

Esta guía documenta el flujo de trabajo para compilar, probar y publicar nuevas versiones de **Antigravity Webview History & Resume**.

---

## 1. Flujo de Desarrollo Local

```bash
# Instalar dependencias
npm install

# Compilar en modo desarrollo (watch)
npm run watch

# Compilar para producción
npm run build
```

---

## 2. Empaquetar la Extensión en formato `.vsix`

Para generar el archivo instalable `.vsix`:

```bash
npx @vscode/vsce package --no-dependencies
```

El archivo resultante (`antigravity-webview-history-vscode-<version>.vsix`) puede compartirse o instalarse directamente en Antigravity IDE con:

```powershell
& "C:\Users\<user>\AppData\Local\Programs\Antigravity IDE\bin\antigravity-ide.cmd" --install-extension "antigravity-webview-history-vscode-<version>.vsix" --force
```

---

## 3. Publicación de Releases en GitHub

1. Actualizar la versión en `package.json`:
   ```json
   "version": "0.3.0"
   ```
2. Crear un commit y tag en Git:
   ```bash
   git add -A
   git commit -m "chore: release v0.3.0"
   git tag v0.3.0
   git push origin main --tags
   ```
3. Crear un nuevo Release en GitHub adjuntando el archivo `.vsix` generado:
   `https://github.com/AudiXP/antigravity-webview-history-vscode/releases`
