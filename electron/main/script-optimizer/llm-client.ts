import type { LLMConfig, LLMProvider } from './types'

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LLMResponse {
  content: string
  inputTokens: number
  outputTokens: number
}

export class LLMClient {
  constructor(private config: LLMConfig) {}

  /** 发送聊天请求 */
  async chat(messages: LLMMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<LLMResponse> {
    const { provider, apiKey, baseUrl, model } = this.config
    const temperature = options?.temperature ?? 0.7
    const maxTokens = options?.maxTokens ?? 4096

    switch (provider) {
      case 'claude':
        return this.callClaude(messages, apiKey, model, temperature, maxTokens)
      case 'openai':
        return this.callOpenAI(messages, apiKey, baseUrl, model, temperature, maxTokens)
      case 'custom':
        return this.callOpenAI(messages, apiKey, baseUrl, model, temperature, maxTokens)
      default:
        throw new Error(`Unsupported LLM provider: ${provider}`)
    }
  }

  /** Claude API */
  private async callClaude(
    messages: LLMMessage[],
    apiKey: string,
    model?: string,
    temperature?: number,
    maxTokens?: number
  ): Promise<LLMResponse> {
    const sysMsg = messages.find(m => m.role === 'system')
    const nonSysMsgs = messages.filter(m => m.role !== 'system')

    const body: Record<string, unknown> = {
      model: model || 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      temperature,
      messages: nonSysMsgs.map(m => ({ role: m.role, content: m.content }))
    }
    if (sysMsg) body.system = sysMsg.content

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Claude API error ${res.status}: ${errText}`)
    }

    const data = await res.json()
    return {
      content: data.content[0]?.text || '',
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0
    }
  }

  /** OpenAI / 兼容 API */
  private async callOpenAI(
    messages: LLMMessage[],
    apiKey: string,
    baseUrl?: string,
    model?: string,
    temperature?: number,
    maxTokens?: number
  ): Promise<LLMResponse> {
    const url = (baseUrl || 'https://api.openai.com').replace(/\/$/, '') + '/v1/chat/completions'

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || 'gpt-4o',
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        temperature,
        max_tokens: maxTokens
      })
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`OpenAI API error ${res.status}: ${errText}`)
    }

    const data = await res.json()
    return {
      content: data.choices[0]?.message?.content || '',
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0
    }
  }
}
