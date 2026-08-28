// ========================================
// ALLEVIN MK XV — OpenAI Request Compatibility
// Server-only request shaping shared by ALLEVIN language routes.
// ========================================

/**
 * Newer reasoning/model families use max_completion_tokens and may reject a
 * caller-supplied temperature. Keeping that compatibility decision in one
 * place prevents chat and notifications from silently taking different paths.
 */
export function openAICompletionOptions(model: string, tokenBudget: number, temperature?: number) {
   const modern = /^(?:gpt-5|o\d|o[1-9]-)/i.test(model.trim());
   return {
      ...(modern ? { max_completion_tokens: tokenBudget } : { max_tokens: tokenBudget }),
      ...(!modern && typeof temperature === "number" ? { temperature } : {}),
   };
}

export function providerFailureReason(status: number) {
   if (status === 401 || status === 403) return "provider-auth";
   if (status === 404) return "provider-model";
   if (status === 408 || status === 504) return "provider-timeout";
   if (status === 429) return "provider-rate";
   if (status >= 500) return "provider-server";
   return `provider-${status}`;
}

export function providerFailureIsRetryable(status: number) {
   return status === 408 || status === 409 || status === 429 || status >= 500;
}
