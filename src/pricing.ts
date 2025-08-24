/**
 * Model pricing data fetcher for Gemini models
 * Based on ccusage implementation but simplified for Gemini-specific use
 */

import { CACHE_TOKEN_COST_MULTIPLIER, LITELLM_PRICING_URL } from './_consts';
import { prefetchGeminiPricing } from './_macro' with { type: 'macro' };

export type ModelPricing = {
	inputCostPerToken: number;
	outputCostPerToken: number;
	cachedCostPerToken?: number;
	maxInputTokens?: number;
	maxTokens?: number;
};

let pricingCache: Map<string, ModelPricing> | null = null;

// Fallback pricing for experimental Gemini models (not in LiteLLM yet)
const EXPERIMENTAL_MODELS: Record<string, ModelPricing> = {
	'gemini-2.0-flash-exp': {
		inputCostPerToken: 0, // Free during experimental phase
		outputCostPerToken: 0,
	},
	'gemini-2.0-flash-thinking-exp': {
		inputCostPerToken: 0, // Free during experimental phase
		outputCostPerToken: 0,
	},
	'gemini-2.0-flash-thinking-exp-1219': {
		inputCostPerToken: 0, // Free during experimental phase
		outputCostPerToken: 0,
	},
	'gemini-exp-1206': {
		inputCostPerToken: 0, // Free during experimental phase
		outputCostPerToken: 0,
	},
	'gemini-exp-1121': {
		inputCostPerToken: 0, // Free during experimental phase
		outputCostPerToken: 0,
	},
	'learnlm-1.5-pro-experimental': {
		inputCostPerToken: 0, // Free during experimental phase
		outputCostPerToken: 0,
	},
};

export async function fetchPricingData(offline = false): Promise<Map<string, ModelPricing>> {
	if (pricingCache != null) {
		return pricingCache;
	}

	// If offline mode is requested, use pre-fetched data
	if (offline) {
		try {
			const offlinePricing = await prefetchGeminiPricing();
			const pricing = new Map(Object.entries(offlinePricing));

			// Add experimental models
			for (const [modelName, modelPricing] of Object.entries(EXPERIMENTAL_MODELS)) {
				if (!pricing.has(modelName)) {
					pricing.set(modelName, modelPricing);
				}
			}

			pricingCache = pricing;
			return pricing;
		}
		catch {
			// Fall back to experimental models only
			const fallback = new Map(Object.entries(EXPERIMENTAL_MODELS));
			pricingCache = fallback;
			return fallback;
		}
	}

	try {
		const response = await fetch(LITELLM_PRICING_URL);
		if (!response.ok) {
			throw new Error(`Failed to fetch pricing: ${response.statusText}`);
		}

		const data = await response.json() as Record<string, unknown>;
		const pricing = new Map<string, ModelPricing>();

		// Parse LiteLLM pricing data
		for (const [modelName, modelData] of Object.entries(data)) {
			if (typeof modelData === 'object' && modelData !== null) {
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
					pricing.set(modelName, {
						inputCostPerToken: inputCost,
						outputCostPerToken: outputCost,
						cachedCostPerToken: cachedCost,
						maxInputTokens: maxInput,
						maxTokens,
					});
				}
			}
		}

		// Add experimental models
		for (const [modelName, modelPricing] of Object.entries(EXPERIMENTAL_MODELS)) {
			if (!pricing.has(modelName)) {
				pricing.set(modelName, modelPricing);
			}
		}

		pricingCache = pricing;
		// Don't use console.log since it interferes with UI
		return pricing;
	}
	catch {
		// Network fetch failed, try to fall back to offline data
		try {
			const offlinePricing = await prefetchGeminiPricing();
			const pricing = new Map(Object.entries(offlinePricing));

			// Add experimental models
			for (const [modelName, modelPricing] of Object.entries(EXPERIMENTAL_MODELS)) {
				if (!pricing.has(modelName)) {
					pricing.set(modelName, modelPricing);
				}
			}

			pricingCache = pricing;
			return pricing;
		}
		catch {
			// Use logger for errors, but avoid during UI display to prevent interference
			// Return experimental models only as fallback
			const fallback = new Map(Object.entries(EXPERIMENTAL_MODELS));
			pricingCache = fallback;
			return fallback;
		}
	}
}

export async function getModelPricing(
	modelName: string,
	offline = false,
): Promise<ModelPricing | null> {
	const pricing = await fetchPricingData(offline);

	// Direct match
	let modelPricing = pricing.get(modelName);
	if (modelPricing != null) {
		return modelPricing;
	}

	// Try with provider prefixes for Gemini
	const variations = [
		modelName,
		`google/${modelName}`,
		`vertex_ai/${modelName}`,
		`gemini/${modelName}`,
	];

	for (const variant of variations) {
		modelPricing = pricing.get(variant);
		if (modelPricing != null) {
			return modelPricing;
		}
	}

	// Try experimental models first (exact match)
	modelPricing = EXPERIMENTAL_MODELS[modelName];
	if (modelPricing != null) {
		return modelPricing;
	}

	// Try partial match for Gemini models in LiteLLM data
	const lowerModel = modelName.toLowerCase();
	for (const [key, value] of pricing) {
		const lowerKey = key.toLowerCase();
		if (
			lowerKey.includes('gemini')
			&& (lowerModel.includes(lowerKey) || lowerKey.includes(lowerModel))
		) {
			return value;
		}
	}

	// Last resort: check experimental models with partial match
	for (const [key, value] of Object.entries(EXPERIMENTAL_MODELS)) {
		if (modelName.includes(key) || key.includes(modelName)) {
			return value;
		}
	}

	// Use logger for warnings, but avoid during UI display to prevent interference
	return null;
}

export type CostCalculation = {
	inputCost: number;
	outputCost: number;
	cachedCost: number;
	thoughtsCost: number;
	toolCost: number;
	totalCost: number;
};

export async function calculateCost(
	modelName: string,
	inputTokens: number,
	outputTokens: number,
	cachedTokens: number = 0,
	thoughtsTokens: number = 0,
	toolTokens: number = 0,
	offline = false,
): Promise<CostCalculation | null> {
	const pricing = await getModelPricing(modelName, offline);
	if (pricing == null) {
		return null;
	}

	const inputCost = inputTokens * pricing.inputCostPerToken;
	const outputCost = outputTokens * pricing.outputCostPerToken;

	// Use cached token pricing if available, otherwise use default multiplier of input cost
	const cachedCost = cachedTokens * (pricing.cachedCostPerToken ?? pricing.inputCostPerToken * CACHE_TOKEN_COST_MULTIPLIER);

	// Thoughts and tool tokens are typically charged as output tokens
	const thoughtsCost = thoughtsTokens * pricing.outputCostPerToken;
	const toolCost = toolTokens * pricing.outputCostPerToken;

	return {
		inputCost,
		outputCost,
		cachedCost,
		thoughtsCost,
		toolCost,
		totalCost: inputCost + outputCost + cachedCost + thoughtsCost + toolCost,
	};
}
