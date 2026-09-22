import { useCallback, useEffect, useState } from 'react'
import { invalidate, peek } from './requestCache'

export interface AsyncState<T> {
  data: T | null
  error: string | null
  loading: boolean
  reload: () => void
}

export interface AsyncOptions {
  /**
   * Request-cache key. When provided, a cached result is used as the initial
   * state, so switching back to a view shows its content on the first frame
   * instead of a spinner. Reload bypasses the cache.
   */
  cacheKey?: string
}

/**
 * Minimal request hook: enough for this app, no data-fetching dependency.
 *
 * Note the `setData(null)` on every run. Keeping the previous result while a
 * new one loads would let one expert's citations render under another
 * expert's name for a frame — in an app whose whole premise is attribution,
 * a stale render is a correctness bug, not a flicker.
 */
export function useAsync<T>(
  fn: () => Promise<T>,
  deps: unknown[],
  options: AsyncOptions = {},
): AsyncState<T> {
  const { cacheKey } = options
  const seed = cacheKey ? peek<T>(cacheKey) : null

  const [data, setData] = useState<T | null>(seed)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(seed === null)
  const [nonce, setNonce] = useState(0)

  // The caller owns the dependency list, exactly like useEffect.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps)

  useEffect(() => {
    let cancelled = false

    // A cache hit renders immediately; only a miss shows the loading state.
    // Data is still cleared on a miss, because holding the previous view's
    // result would attribute one expert's citations to another.
    const hit = cacheKey ? peek<T>(cacheKey) : null
    setData(hit)
    setError(null)
    setLoading(hit === null)

    run()
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [run, nonce, cacheKey])

  return {
    data,
    error,
    loading,
    reload: () => {
      if (cacheKey) invalidate(cacheKey)
      setNonce((value) => value + 1)
    },
  }
}
