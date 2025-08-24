/**
 * Prefetch Gemini model pricing data for offline mode
 */

import type { ModelPricing } from './pricing';
import { LITELLM_PRICING_URL } from './_consts';

/**
 * Prefetches the pricing data for Gemini models from the LiteLLM API.
 * This function fetches the pricing data and filters out models that contain 'gemini'.
 * It returns a record of model names to their pricing information.
 *
 * Note: This is a macro function that runs at build time and returns static data.
 *
 * @returns A record of model names and their pricing information.
 * @throws Will throw an error if the fetch operation fails.
 */
export async function prefetchGeminiPricing(): Promise<Record<string, ModelPricing>> {
	const response = await fetch(LITELLM_PRICING_URL);
	if (!response.ok) {
		throw new Error(`Failed to fetch pricing data: ${response.statusText}`);
	}

	const data = await response.json() as Record<string, unknown>;

	const prefetchGeminiData: Record<string, ModelPricing> = {};

	// Cache all models that contain 'gemini' (case-insensitive)
	for (const [modelName, modelData] of Object.entries(data)) {
		const lowerModelName = modelName.toLowerCase();
		if ((lowerModelName.includes('gemini') || lowerModelName.includes('google')) && modelData != null && typeof modelData === 'object') {
			const model = modelData as Record<string, unknown>;
			// Only process models with pricing information
			if (
				typeof model.input_cost_per_token === 'number'
				|| typeof model.output_cost_per_token === 'number'
			) {
				const inputCost = typeof model.input_cost_per_token === 'number' ? model.input_cost_per_token : 0;
				const outputCost = typeof model.output_cost_per_token === 'number' ? model.output_cost_per_token : 0;
				const cachedCost = typeof model.cache_read_input_token_cost === 'number' ? model.cache_read_input_token_cost : undefined;
				const maxInput = typeof model.max_input_tokens === 'number' ? model.max_input_tokens : undefined;
				const maxTokens = typeof model.max_tokens === 'number' ? model.max_tokens : undefined;

				prefetchGeminiData[modelName] = {
					inputCostPerToken: inputCost,
					outputCostPerToken: outputCost,
					cachedCostPerToken: cachedCost,
					maxInputTokens: maxInput,
					maxTokens,
				};
			}
		}
	}

	return prefetchGeminiData;
}
