// Token → USD pricing calculator
// Prices per million tokens (input / output)
const MODEL_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  "claude-opus-4": { inputPer1M: 15.0, outputPer1M: 75.0 },
  "claude-sonnet-4": { inputPer1M: 3.0, outputPer1M: 15.0 },
  "claude-haiku-4": { inputPer1M: 0.8, outputPer1M: 4.0 },
};

export function tokensToUsd(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING["claude-sonnet-4"];
  return (
    (inputTokens / 1_000_000) * pricing.inputPer1M +
    (outputTokens / 1_000_000) * pricing.outputPer1M
  );
}
