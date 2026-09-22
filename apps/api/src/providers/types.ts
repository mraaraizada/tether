/** One structured-output request, however the provider fulfils it. */
export interface StructuredRequest {
  /** Stable prefix: instructions + corpus. Cached by providers that support it. */
  systemStable: string
  /** Volatile suffix — the actual task. */
  userPrompt: string
  toolName: string
  toolDescription: string
  /** JSON Schema that the response must satisfy. */
  schema: Record<string, unknown>
  maxTokens?: number
}

export interface StructuredResult<T> {
  output: T
  usage: { inputTokens: number; cacheReadTokens: number; outputTokens: number }
}

export interface StructuredProvider {
  /** Shown in the UI badge and used in cache keys. */
  readonly id: string
  readonly model: string
  call<T>(request: StructuredRequest): Promise<StructuredResult<T>>
}
