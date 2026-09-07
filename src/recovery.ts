/**
 * Conversation recovery — scan .pb files and trigger LS to index unindexed conversations.
 *
 * Ported from Python CLI recover command.
 *
 * Logic:
 * 1. Scan ~/.gemini/antigravity/conversations/ for .pb files
 * 2. Compare with indexed conversations from LS API
 * 3. For unindexed ones, call GetCascadeTrajectorySteps(id, 5) to trigger on-demand loading
 * 4. After recovery, LS will include them in GetAllCascadeTrajectories
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { callApi } from './ls-client.js';

/**
 * Discover the conversations directories (both Antigravity IDE and legacy Antigravity).
 */
export function getConversationsDirs(): string[] {
  const dirs = [
    path.join(os.homedir(), '.gemini', 'antigravity-ide', 'conversations'),
    path.join(os.homedir(), '.gemini', 'antigravity', 'conversations'),
  ];
  return dirs.filter((d) => fs.existsSync(d));
}

/**
 * Scan .pb and .db files across all conversation directories and return unique cascade IDs.
 */
export function scanDiskFiles(convDirs: string[]): string[] {
  const allIds = new Set<string>();
  for (const dir of convDirs) {
    try {
      const files = fs.readdirSync(dir);
      for (const f of files) {
        if (f.endsWith('.pb') || f.endsWith('.db')) {
          allIds.add(f.replace(/\.(pb|db)$/, ''));
        }
      }
    } catch {
      // ignore
    }
  }
  return Array.from(allIds);
}

// Alias for backwards compatibility
export const scanPbFiles = scanDiskFiles;

/**
 * Sync files for a given cascadeId across all existing conversation directories.
 * Ensures that if a .db or .pb exists in ~/.gemini/antigravity/ it is also present
 * in ~/.gemini/antigravity-ide/ (and vice versa) so any running Language Server
 * regardless of its --app_data_dir can access and activate it.
 */
export function syncCascadeFiles(cascadeId: string, convDirs: string[]): void {
  if (convDirs.length <= 1) { return; }
  const extensions = ['.db', '.db-wal', '.db-shm', '.pb'];

  for (const ext of extensions) {
    const filename = `${cascadeId}${ext}`;
    let bestSource: { path: string; size: number } | null = null;

    // 1. Encontrar la copia existente con mayor tamaño en disco
    for (const dir of convDirs) {
      const full = path.join(dir, filename);
      try {
        if (fs.existsSync(full)) {
          const stats = fs.statSync(full);
          if (!bestSource || stats.size > bestSource.size) {
            bestSource = { path: full, size: stats.size };
          }
        }
      } catch {
        // ignore stat errors
      }
    }

    // 2. Si encontramos una copia válida, sincronizar a los demás directorios.
    // Si en el destino no existe, o existe pero está truncado/vaciado (tamaño menor), sobrescribir.
    if (bestSource && bestSource.size > 0) {
      for (const dir of convDirs) {
        const dest = path.join(dir, filename);
        if (dest === bestSource.path) { continue; }

        let shouldCopy = false;
        try {
          if (!fs.existsSync(dest)) {
            shouldCopy = true;
          } else {
            const destStat = fs.statSync(dest);
            // Si el destino es menor que el origen (ej: vaciado a 48KB vs 1.2MB real), sobrescribir
            if (destStat.size < bestSource.size) {
              shouldCopy = true;
            }
          }
        } catch {
          shouldCopy = true;
        }

        if (shouldCopy) {
          try {
            fs.copyFileSync(bestSource.path, dest);
          } catch {
            // ignore copy errors
          }
        }
      }
    }
  }
}

/**
 * Sync all conversation files across all known conversation directories.
 */
export function syncAllConversations(convDirs: string[]): void {
  if (convDirs.length <= 1) { return; }
  const ids = scanDiskFiles(convDirs);
  for (const id of ids) {
    syncCascadeFiles(id, convDirs);
  }
}

/**
 * Recover unindexed conversations by triggering on-demand loading.
 *
 * @param indexedIds Set of already-indexed cascade IDs
 * @param endpoints Active LS endpoints
 * @param onProgress Callback for progress updates
 * @param forceAll If true, triggers activation for all conversations found on disk
 * @returns Number of newly activated conversations
 */
export async function recoverUnindexed(
  indexedIds: Set<string>,
  endpoints: Array<{ port: number; csrf: string }>,
  onProgress?: (done: number, total: number, id: string) => void,
  forceAll = false,
): Promise<{ activated: number; failed: number; total: number }> {
  const convDirs = getConversationsDirs();
  if (convDirs.length === 0 || endpoints.length === 0) {
    return { activated: 0, failed: 0, total: 0 };
  }

  // Pre-sync all conversation files across directories
  syncAllConversations(convDirs);

  const allDiskIds = scanDiskFiles(convDirs);
  const targets = forceAll ? allDiskIds : allDiskIds.filter((id) => !indexedIds.has(id));

  if (targets.length === 0) {
    return { activated: 0, failed: 0, total: 0 };
  }

  let activated = 0;
  let failed = 0;

  // Process in batches of 10, round-robin across endpoints for load balancing
  const batchSize = 10;
  for (let i = 0; i < targets.length; i += batchSize) {
    const batch = targets.slice(i, i + batchSize);
    const promises = batch.map(async (cascadeId, j) => {
      // Round-robin across available endpoints
      const ep = endpoints[(i + j) % endpoints.length];
      const result = await callApi(
        ep.port, ep.csrf,
        'GetCascadeTrajectorySteps',
        { cascadeId, startIndex: 0, endIndex: 1 },  // stepCount=1, just trigger indexing
        5000,  // 5s timeout
      );
      // Also notify LoadTrajectory if possible
      callApi(ep.port, ep.csrf, 'LoadTrajectory', { cascadeId }, 2000).catch(() => {});
      return { cascadeId, success: result !== null };
    });

    const results = await Promise.all(promises);
    for (const r of results) {
      if (r.success) { activated++; } else { failed++; }
      onProgress?.(activated + failed, targets.length, r.cascadeId);
    }
  }

  return { activated, failed, total: targets.length };
}
