import { TIKTOKEN_MODEL_MAPPING } from '@langtrace-constants/instrumentation/common'
import { OPENAI_COST_TABLE } from '@langtrace-constants/instrumentation/openai'
import { TiktokenEncoding, get_encoding } from 'tiktoken'

export function estimateTokens (prompt: string): number {
  if (prompt.length > 0) {
    // Simplified token estimation: count the words.
    return prompt.split(/\s+/).filter(Boolean).length
  }
  return 0
}

export function estimateTokensUsingTikToken (
  prompt: string,
  model: TiktokenEncoding
): number {
  const encoding = get_encoding(model)
  const tokens = encoding.encode(prompt)
  return tokens.length
}

export function calculatePromptTokens (
  promptContent: string,
  model: string
): number {
  try {
    const tiktokenModel = TIKTOKEN_MODEL_MAPPING[model]
    return estimateTokensUsingTikToken(promptContent, tiktokenModel)
  } catch (error) {
    return estimateTokens(promptContent) // Fallback method
  }
}

export function calculatePriceFromUsage (
  model: string,
  usage: { prompt_tokens: number, completion_tokens: number }
): number {
  const costTable = OPENAI_COST_TABLE[model]
  if (costTable !== undefined) {
    return (
      (costTable.input * usage.prompt_tokens +
        costTable.output * usage.completion_tokens) /
      1000
    )
  }
  return 0
}