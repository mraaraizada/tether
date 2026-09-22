import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Anchored to the repo root for the same reason as DATA_DIR in corpus.ts.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

/**
 * Where cached answers are read from and written to.
 *
 * Serverless filesystems are read-only apart from /tmp, so `CACHE_DIR` can
 * point at a writable location while `CACHE_SEED_DIR` keeps pointing at the
 * read-only copy shipped with the deployment. Reads check both, which is what
 * lets a deployment ship with answers precomputed locally: the demo is instant
 * and never waits on a model call it might not have time to finish.
 */
const CACHE_DIR = process.env.CACHE_DIR ? path.resolve(process.env.CACHE_DIR) : path.join(REPO_ROOT, '.cache')
const SEED_DIR = process.env.CACHE_SEED_DIR
  ? path.resolve(process.env.CACHE_SEED_DIR)
  : path.join(REPO_ROOT, 'data', 'precomputed')

/**
 * Disk cache keyed by (task, model, corpus + prompt fingerprint, input).
 * Guide answers and cross-call analysis are deterministic products of the
 * corpus, so they are computed once and replayed — the demo stays instant and
 * the bill stays flat however often the page is reloaded.
 */
export function cacheKey(parts: unknown[]): string {
  return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32)
}

export function readCache<T>(key: string): T | null {
  for (const dir of new Set([CACHE_DIR, SEED_DIR])) {
    const file = path.join(dir, `${key}.json`)
    if (!fs.existsSync(file)) continue
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8')) as T
    } catch {
      // A truncated or corrupt entry degrades to a recompute, never a crash.
    }
  }
  return null
}

export function writeCache(key: string, value: unknown): void {
  // A read-only filesystem is a normal deployment condition, not an error:
  // the answer is still returned, it simply is not persisted.
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true })
    fs.writeFileSync(path.join(CACHE_DIR, `${key}.json`), JSON.stringify(value, null, 2), 'utf8')
  } catch (error) {
    console.warn(`Cache write skipped (${(error as Error).message})`)
  }
}

export function clearCache(): void {
  if (!fs.existsSync(CACHE_DIR)) return
  try {
    for (const file of fs.readdirSync(CACHE_DIR)) {
      if (file.endsWith('.json')) fs.unlinkSync(path.join(CACHE_DIR, file))
    }
  } catch (error) {
    console.warn(`Cache clear skipped (${(error as Error).message})`)
  }
}

/**
 * Bounded in-memory LRU for open-ended user questions.
 *
 * Ask results are *not* written to disk: every distinct question is a new key,
 * so a disk cache would grow without limit from ordinary use. Guide answers
 * and cross-call analysis have a fixed, small key space and stay on disk.
 */
export class LruCache<T> {
  private readonly entries = new Map<string, T>()

  constructor(private readonly maxEntries = 100) {}

  get(key: string): T | null {
    if (!this.entries.has(key)) return null
    const value = this.entries.get(key) as T
    // Re-insert so the most recently used key is last in iteration order.
    this.entries.delete(key)
    this.entries.set(key, value)
    return value
  }

  set(key: string, value: T): void {
    if (this.entries.has(key)) this.entries.delete(key)
    this.entries.set(key, value)
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) break
      this.entries.delete(oldest)
    }
  }

  clear(): void {
    this.entries.clear()
  }
}
