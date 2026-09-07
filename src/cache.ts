/**
 * Local JSON cache for conversation summaries.
 *
 * Provides instant UI on IDE restart by caching the last known conversation list.
 * Cache is updated after every successful API refresh.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TrajectorySummary } from './ls-client.js';

const CACHE_DIR = path.join(os.homedir(), '.gemini', 'antigravity-history');
const CACHE_FILE = path.join(CACHE_DIR, 'cache.json');

interface CacheData {
  version: 1;
  updatedAt: string;
  conversations: Record<string, TrajectorySummary>;
  archivedIds?: string[];
}

/**
 * Read cached conversation summaries. Returns empty object on any error.
 */
export function readCache(): Record<string, TrajectorySummary> {
  try {
    if (!fs.existsSync(CACHE_FILE)) { return {}; }
    const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
    const data: CacheData = JSON.parse(raw);
    if (data.version !== 1) { return {}; }
    return data.conversations || {};
  } catch {
    return {};
  }
}

/**
 * Read archived conversation IDs from cache.
 */
export function readArchivedIds(): Set<string> {
  try {
    if (!fs.existsSync(CACHE_FILE)) { return new Set(); }
    const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
    const data: CacheData = JSON.parse(raw);
    return new Set(data.archivedIds || []);
  } catch {
    return new Set();
  }
}

/**
 * Write conversation summaries and optional archived IDs to cache.
 */
export function writeCache(
  conversations: Record<string, TrajectorySummary>,
  archivedIds?: Set<string>,
): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    // Preserve existing archivedIds if not provided
    const existingArchived = archivedIds ? Array.from(archivedIds) : Array.from(readArchivedIds());
    const data: CacheData = {
      version: 1,
      updatedAt: new Date().toISOString(),
      conversations,
      archivedIds: existingArchived,
    };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data), 'utf-8');
  } catch {
    // Silently ignore write failures
  }
}

