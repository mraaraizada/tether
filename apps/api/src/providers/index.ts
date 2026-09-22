import { OpenAICompatibleProvider } from './openaiCompatible.js'
import type { StructuredProvider, StructuredRequest, StructuredResult } from './types.js'

export type { StructuredProvider, StructuredRequest, StructuredResult } from './types.js'

/**
 * One integration: the OpenAI-compatible chat API.
 *
 * That dialect is spoken by HuggingFace Inference Providers, OpenRouter,
 * Ollama, LM Studio, vLLM, Groq and Together, so swapping model or vendor is
 * three environment variables and no code. With `OPENAI_BASE_URL` unset the
 * app runs extractive-only — retrieval and verbatim passages, nothing
 * generated.
 */
function select(): StructuredProvider | null {
  const baseUrl = process.env.OPENAI_BASE_URL?.trim()
  if (!baseUrl) return null

  const model = process.env.OPENAI_MODEL?.trim()
  if (!model) throw new Error('OPENAI_MODEL is required when OPENAI_BASE_URL is set')

  return new OpenAICompatibleProvider(model, baseUrl, process.env.OPENAI_API_KEY ?? '')
}

let provider: StructuredProvider | null | undefined

export function getProvider(): StructuredProvider | null {
  if (provider === undefined) provider = select()
  return provider
}

export function isModelEnabled(): boolean {
  return getProvider() !== null
}

/** Model id for the UI badge and cache keys; null when running extractive-only. */
export function modelId(): string | null {
  return getProvider()?.model ?? null
}

export function providerId(): string | null {
  return getProvider()?.id ?? null
}

export async function callStructured<T>(request: StructuredRequest): Promise<StructuredResult<T>> {
  const active = getProvider()
  if (!active) throw new Error('No model provider configured')
  return active.call<T>(request)
}
