# Diagnóstico: Ausencia de la Insignia "⚠️ Borrada en IDE"

El motivo exacto por el cual no aparece la insignia **`⚠️ Borrada en IDE`** en el chat `e16508a5-c025-482f-afb7-16233ee03b15 (Análisis De Resultados Gemini)` se debe a **tres factores técnicos concurrentes** que se anulan mutuamente en el código actual:

---

### 1. Conflicto entre el Language Server del Hub y el del IDE (Memoria)
En el sistema están corriendo **dos procesos de Language Server independientes**:
* **PID 14052 — Google Antigravity Standalone / Hub** (`--subclient_type hub`, carpeta `~/.gemini/antigravity`):
  Tiene **155 conversaciones activas en memoria**, entre ellas **`e16508a5`** (`Has cid: True`).
* **PID 4120 — Antigravity IDE** (`--subclient_type ide`, carpeta `~/.gemini/antigravity-ide`):
  Tiene **0 conversaciones activas** (`Has cid: False`). En el IDE este chat efectivamente **no está cargado ni activo**.

**El fallo en el código:**  
En `src/panel-manager.ts` (`handleRefresh`), la función `discoverAndListAll()` consulta todos los servidores y fusiona sus respuestas en `result.conversations`. Luego hace:
```typescript
liveServerCids = new Set(Object.keys(result.conversations || {}));
```
Al estar vivo `e16508a5` en el proceso Hub (PID 14052), `liveServerCids.has('e16508a5')` devuelve **`true`**. Por lo tanto, la condición:
```typescript
if (liveServerCids.size > 0 && !liveServerCids.has(cid))
```
se evalúa como **falsa**, porque el sistema cree que el chat sigue vivo en el IDE cuando en realidad solo está en el Hub de fondo.

---

### 2. La auto-sincronización silenciosa en disco
La segunda condición para mostrar la insignia evalúa si la base de datos local en el IDE fue vaciada por el editor:
```typescript
const ideStat = fs.statSync(ideFile);
if (ideStat.size <= 50000 || ideStat.size < globalStat.size * 0.5) {
  wipedInIdeIds.push(cid);
}
```
**El fallo en el código:**  
En `src/recovery.ts`, la función `recoverUnindexed()` ejecuta en cada refresco de la extensión `syncAllConversations()`.  
Cuando se borró el chat en el IDE, el archivo SQLite se redujo a ~48 KB. Sin embargo, en el instante en que se abrió o refrescó la extensión, `syncCascadeFiles()` detectó que la copia de respaldo en `~/.gemini/antigravity/conversations/` pesaba 1.2 MB y **sobrescribió silenciosamente el archivo del IDE devolviéndolo a 1,261,568 bytes**.

Al momento de evaluar si el archivo pesaba $\le 50$ KB, el archivo en el IDE ya medía 1.2 MB, por lo que esta condición **también dio falsa**.

---

### 3. Código previo incompleto
En la sesión anterior se había iniciado una modificación en `src/ls-client.ts` para devolver `ideServerCids` (separando los servidores IDE de los del Hub), pero:
1. Quedó pendiente sin conectar en `src/panel-manager.ts`.
2. El archivo quedó sin commitear y sin compilar en el paquete `.vsix` instalado en el IDE.

---

### 🛠️ Solución a aplicar

1. **Separar estrictamente los servidores:** Identificar exclusivamente el Language Server del IDE (`--subclient_type ide`) para determinar `liveServerCids`. Si un chat pertenece al workspace actual y **no** está en las trayectorias del IDE, marcarlo con `⚠️ Borrada en IDE`.
2. **Desactivar la sobrescritura silenciosa en refresco:** Modificar `recovery.ts` para que la restauración del archivo SQLite desde el respaldo solo se efectúe cuando pulses expresamente **▶ Reanudar**, evitando que borre la evidencia de los archivos vaciados.
3. **Compilar y reinstalar:** Empaquetar la versión corregida e instalarla en Antigravity IDE.
