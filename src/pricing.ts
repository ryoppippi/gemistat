/**
 * Model pricing data fetcher for Gemini models
 * Based on ccusage implementation but simplified for Gemini-specific use
 */

export interface ModelPricing {
  inputCostPerToken: number;
  outputCostPerToken: number;
  cachedCostPerToken?: number;
  maxInputTokens?: number;
  maxTokens?: number;
}

const LITELLM_PRICING_URL = 
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

let pricingCache: Map<string, ModelPricing> | null = null;

// Fallback pricing for experimental Gemini models (not in LiteLLM yet)
const EXPERIMENTAL_MODELS: Record<string, ModelPricing> = {
  "gemini-2.0-flash-exp": {
    inputCostPerToken: 0,  // Free during experimental phase
    outputCostPerToken: 0,
  },
  "gemini-2.0-flash-thinking-exp": {
    inputCostPerToken: 0,  // Free during experimental phase
    outputCostPerToken: 0,
  },
  "gemini-2.0-flash-thinking-exp-1219": {
    inputCostPerToken: 0,  // Free during experimental phase
    outputCostPerToken: 0,
  },
  "gemini-exp-1206": {
    inputCostPerToken: 0,  // Free during experimental phase
    outputCostPerToken: 0,
  },
  "gemini-exp-1121": {
    inputCostPerToken: 0,  // Free during experimental phase
    outputCostPerToken: 0,
  },
  "learnlm-1.5-pro-experimental": {
    inputCostPerToken: 0,  // Free during experimental phase
    outputCostPerToken: 0,
  },
};

export async function fetchPricingData(): Promise<Map<string, ModelPricing>> {
  if (pricingCache) return pricingCache;

  try {
    const response = await fetch(LITELLM_PRICING_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch pricing: ${response.statusText}`);
    }

    const data = await response.json() as Record<string, any>;
    const pricing = new Map<string, ModelPricing>();

    // Parse LiteLLM pricing data
    for (const [modelName, modelData] of Object.entries(data)) {
      if (typeof modelData === "object" && modelData !== null) {
        // Only process models with pricing information
        if (
          typeof modelData.input_cost_per_token === "number" ||
          typeof modelData.output_cost_per_token === "number"
        ) {
          pricing.set(modelName, {
            inputCostPerToken: modelData.input_cost_per_token || 0,
            outputCostPerToken: modelData.output_cost_per_token || 0,
            cachedCostPerToken: modelData.cache_read_input_token_cost,
            maxInputTokens: modelData.max_input_tokens,
            maxTokens: modelData.max_tokens,
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
  } catch (error) {
    // Don't use console.error since it interferes with UI
    // Return experimental models only as fallback
    const fallback = new Map(Object.entries(EXPERIMENTAL_MODELS));
    pricingCache = fallback;
    return fallback;
  }
}

export async function getModelPricing(
  modelName: string
): Promise<ModelPricing | null> {
  const pricing = await fetchPricingData();

  // Direct match
  let modelPricing = pricing.get(modelName);
  if (modelPricing) return modelPricing;

  // Try with provider prefixes for Gemini
  const variations = [
    modelName,
    `google/${modelName}`,
    `vertex_ai/${modelName}`,
    `gemini/${modelName}`,
  ];

  for (const variant of variations) {
    modelPricing = pricing.get(variant);
    if (modelPricing) return modelPricing;
  }

  // Try experimental models first (exact match)
  modelPricing = EXPERIMENTAL_MODELS[modelName];
  if (modelPricing) return modelPricing;

  // Try partial match for Gemini models in LiteLLM data
  const lowerModel = modelName.toLowerCase();
  for (const [key, value] of pricing) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes("gemini") &&
      (lowerModel.includes(lowerKey) || lowerKey.includes(lowerModel))
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

  // Don't use console.warn since it interferes with UI
  return null;
}

export interface CostCalculation {
  inputCost: number;
  outputCost: number;
  cachedCost: number;
  thoughtsCost: number;
  toolCost: number;
  totalCost: number;
}

export async function calculateCost(
  modelName: string,
  inputTokens: number,
  outputTokens: number,
  cachedTokens: number = 0,
  thoughtsTokens: number = 0,
  toolTokens: number = 0
): Promise<CostCalculation | null> {
  const pricing = await getModelPricing(modelName);
  if (!pricing) return null;

  const inputCost = inputTokens * pricing.inputCostPerToken;
  const outputCost = outputTokens * pricing.outputCostPerToken;
  
  // Use cached token pricing if available, otherwise use 25% of input cost
  const cachedCost = cachedTokens * (pricing.cachedCostPerToken || pricing.inputCostPerToken * 0.25);
  
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