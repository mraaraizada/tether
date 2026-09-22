import type { StructuredProvider, StructuredRequest, StructuredResult } from './types.js'

/**
 * Any OpenAI-compatible chat endpoint: Ollama, LM Studio, vLLM, Groq,
 * Together, OpenRouter. One integration covers local open-weight models and
 * hosted ones, because they all speak this dialect.
 *
 * Structured output is requested three ways, strongest first, because support
 * varies by server *and* by model:
 *   1. `response_format: json_schema` — the server constrains generation.
 *   2. `response_format: json_object` — valid JSON, shape not guaranteed.
 *   3. Prompt-only — the schema is described in the system message.
 * Whatever comes back is parsed and shape-checked here, so a model that
 * ignores the schema fails loudly instead of poisoning the pipeline.
 */
export class OpenAICompatibleProvider implements StructuredProvider {
  readonly id = 'openai-compatible'

  constructor(
    readonly model: string,
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  async call<T>(request: StructuredRequest): Promise<StructuredResult<T>> {
    const system = `${request.systemStable}

## Response format
Reply with a single JSON object and nothing else — no prose, no markdown fence.
It must satisfy this JSON Schema:

${JSON.stringify(request.schema, null, 2)}`

    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: request.userPrompt },
      ],
      max_tokens: request.maxTokens ?? 8000,
      temperature: 0,
      response_format: {
        type: 'json_schema',
        json_schema: { name: request.toolName, schema: request.schema, strict: true },
      },
    }

    let response = await this.post(body)

    // Older servers reject json_schema outright; retry down the ladder.
    if (!response.ok && response.status >= 400 && response.status < 500) {
      response = await this.post({ ...body, response_format: { type: 'json_object' } })
      if (!response.ok && response.status >= 400 && response.status < 500) {
        const { response_format: _ignored, ...withoutFormat } = body
        response = await this.post(withoutFormat)
      }
    }

    if (!response.ok) {
      throw new Error(`${this.baseUrl} returned ${response.status}: ${(await response.text()).slice(0, 200)}`)
    }

    const payload = (await response.json()) as {
      choices?: {
        finish_reason?: string
        message?: { content?: string; reasoning?: string; reasoning_content?: string }
      }[]
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }

    const choice = payload.choices?.[0]
    const message = choice?.message

    // Reasoning models put their chain of thought in `reasoning` and can
    // exhaust max_tokens before emitting any `content`. If the answer is only
    // in the reasoning field, use it — the JSON extractor below copes with the
    // surrounding prose, and the citation gate still verifies every quote.
    const content =
      message?.content?.trim() || message?.reasoning?.trim() || message?.reasoning_content?.trim()

    if (!content) {
      const reason = choice?.finish_reason ?? 'unknown'
      throw new Error(
        reason === 'length'
          ? `Model hit its token limit before answering (finish_reason=length). Raise max_tokens or use a model with a larger output budget.`
          : `Model returned an empty response (finish_reason=${reason})`,
      )
    }

    return {
      output: parseJsonObject<T>(content),
      usage: {
        inputTokens: payload.usage?.prompt_tokens ?? 0,
        cacheReadTokens: 0,
        outputTokens: payload.usage?.completion_tokens ?? 0,
      },
    }
  }

  private async post(body: unknown): Promise<Response> {
    const url = `${this.baseUrl.replace(/\/$/, '')}/chat/completions`

    try {
      return await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(Number(process.env.MODEL_TIMEOUT_MS ?? 300_000)),
      })
    } catch (error) {
      // Node's fetch reports every transport problem as "fetch failed" and
      // hides the real reason in `cause`. On a deployed box that is the
      // difference between a DNS failure, a blocked egress and a TLS error,
      // so it is unwrapped here rather than left to guesswork.
      const cause = (error as { cause?: { code?: string; message?: string } }).cause
      const detail = cause?.code ?? cause?.message ?? (error as Error).message
      throw new Error(`Cannot reach ${url}: ${detail}`)
    }
  }
}

/**
 * Open models commonly wrap JSON in a markdown fence, prefix it with a
 * sentence, or emit a `<think>` block first. Recover from all three rather
 * than failing a response whose content is actually fine.
 */
export function parseJsonObject<T>(raw: string): T {
  const withoutThinking = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(withoutThinking)
  const candidate = (fenced ? fenced[1] : withoutThinking).trim()

  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('Model response contained no JSON object')

  const slice = candidate.slice(start, end + 1)
  try {
    return JSON.parse(slice) as T
  } catch (error) {
    throw new Error(`Model returned invalid JSON: ${(error as Error).message}`)
  }
}
