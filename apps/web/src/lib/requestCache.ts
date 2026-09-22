/**
 * Client-side request cache.
 *
 * The API already caches its own work, but every view switch still fired a
 * fresh request and flashed a loading state for a result that had not changed.
 * Answers here are deterministic for a given corpus, so once fetched they are
 * reused for the session and revisiting a view is instant.
 *
 * Two jobs:
 *   - `peek` lets a component seed its initial state synchronously, so a
 *     cached view renders content on its first frame instead of a spinner.
 *   - in-flight promises are shared, so two components mounting at once (the
 *     coverage matrix and the guide view asking for the same expert) make one
 *     request, not two.
 */
const results = new Map<string, unknown>()
const inFlight = new Map<string, Promise<unknown>>()

export function peek<T>(key: string): T | null {
  return results.has(key) ? (results.get(key) as T) : null
}

export async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = results.get(key)
  if (hit !== undefined) return hit as T

  const pending = inFlight.get(key)
  if (pending) return pending as Promise<T>

  const request = load()
    .then((value) => {
      results.set(key, value)
      return value
    })
    .finally(() => {
      inFlight.delete(key)
    })

  inFlight.set(key, request)
  return request
}

/** Drops one entry, or everything when called with no key (used by Retry). */
export function invalidate(key?: string): void {
  if (key === undefined) {
    results.clear()
    inFlight.clear()
    return
  }
  results.delete(key)
  inFlight.delete(key)
}
