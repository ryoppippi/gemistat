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
 * Type inference helpers
 */
export type DailyUsageSchema = z.infer<typeof dailyUsageSchema>;
export type MonthlyUsageSchema = z.infer<typeof monthlyUsageSchema>;
export type TelemetryEventSchema = z.infer<typeof telemetryEventSchema>;
export type TotalsSchema = z.infer<typeof totalsSchema>;
