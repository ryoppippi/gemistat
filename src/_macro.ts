/**
 * Prefetch Gemini model pricing data for offline mode
 */

import type { ModelPricing } from './pricing.ts';
import { fetchLiteLLMData, filterModels, isGeminiModel } from './_litellm-fetch.ts';

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
	const data = await fetchLiteLLMData();
	const geminiData = filterModels(data, isGeminiModel);

	const prefetchGeminiData: Record<string, ModelPricing> = {};

	// Convert LiteLLM format to ModelPricing format
	for (const [modelName, modelData] of Object.entries(geminiData)) {
		const inputCost = modelData.input_cost_per_token ?? 0;
		const outputCost = modelData.output_cost_per_token ?? 0;
		const cachedCost = modelData.cache_read_input_token_cost;
		const maxInput = modelData.max_input_tokens;
		const maxTokens = modelData.max_tokens;

		prefetchGeminiData[modelName] = {
			inputCostPerToken: inputCost,
			outputCostPerToken: outputCost,
			cachedCostPerToken: cachedCost,
			maxInputTokens: maxInput,
			maxTokens,
		};
	}

	return prefetchGeminiData;
}
