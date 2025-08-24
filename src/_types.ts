/**
 * Daily usage data structure
 */
export type DailyUsage = {
	date: string;
	inputTokens: number;
	outputTokens: number;
	cacheCreationTokens: number;
	cacheReadTokens: number;
	totalCost: number;
	modelsUsed: string[];
};

/**
 * Monthly usage data structure
 */
export type MonthlyUsage = {
	month: string;
	inputTokens: number;
	outputTokens: number;
	cacheCreationTokens: number;
	cacheReadTokens: number;
	totalCost: number;
	modelsUsed: string[];
};

/**
 * Telemetry event data from JSONL files
 */
export type TelemetryEvent = {
	timestamp: string;
	model?: string;
	inputTokens?: number;
	outputTokens?: number;
	cachedTokens?: number;
	thoughtsTokens?: number;
	toolTokens?: number;
	totalCost?: number;
	[key: string]: any;
};

/**
 * Aggregated totals
 */
export type Totals = {
	inputTokens: number;
	outputTokens: number;
	cacheCreationTokens: number;
	cacheReadTokens: number;
	totalCost: number;
};
