import * as z from 'zod';

/**
 * Daily usage data validation schema
 */
export const dailyUsageSchema = z.object({
	date: z.string(),
	inputTokens: z.number().int().min(0),
	outputTokens: z.number().int().min(0),
	cacheCreationTokens: z.number().int().min(0),
	cacheReadTokens: z.number().int().min(0),
	totalCost: z.number().min(0),
	modelsUsed: z.array(z.string()),
});

/**
 * Monthly usage data validation schema
 */
export const monthlyUsageSchema = z.object({
	month: z.string(),
	inputTokens: z.number().int().min(0),
	outputTokens: z.number().int().min(0),
	cacheCreationTokens: z.number().int().min(0),
	cacheReadTokens: z.number().int().min(0),
	totalCost: z.number().min(0),
	modelsUsed: z.array(z.string()),
});

/**
 * Telemetry event data validation schema
 */
export const telemetryEventSchema = z.object({
	timestamp: z.string(),
	model: z.string().optional(),
	inputTokens: z.number().int().min(0).optional(),
	outputTokens: z.number().int().min(0).optional(),
	cachedTokens: z.number().int().min(0).optional(),
	thoughtsTokens: z.number().int().min(0).optional(),
	toolTokens: z.number().int().min(0).optional(),
	totalCost: z.number().min(0).optional(),
}).passthrough();

/**
 * Aggregated totals validation schema
 */
export const totalsSchema = z.object({
	inputTokens: z.number().int().min(0),
	outputTokens: z.number().int().min(0),
	cacheCreationTokens: z.number().int().min(0),
	cacheReadTokens: z.number().int().min(0),
	totalCost: z.number().min(0),
});

/**
 * LiteLLM model data validation schema
 */
export const liteLLMModelDataSchema = z.object({
	input_cost_per_token: z.number().min(0).optional(),
	output_cost_per_token: z.number().min(0).optional(),
	cache_creation_input_token_cost: z.number().min(0).optional(),
	cache_read_input_token_cost: z.number().min(0).optional(),
	max_tokens: z.number().int().min(1).optional(),
	max_input_tokens: z.number().int().min(1).optional(),
	max_output_tokens: z.number().int().min(1).optional(),
}).passthrough();

/**
 * Type inference from Zod schemas
 */
export type DailyUsage = z.infer<typeof dailyUsageSchema>;
export type MonthlyUsage = z.infer<typeof monthlyUsageSchema>;
export type TelemetryEvent = z.infer<typeof telemetryEventSchema>;
export type Totals = z.infer<typeof totalsSchema>;
export type LiteLLMModelData = z.infer<typeof liteLLMModelDataSchema>;
