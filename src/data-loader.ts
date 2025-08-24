import type { DailyUsage, MonthlyUsage, TelemetryEvent, Totals } from './_types';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { logger } from './logger';
import { calculateCost } from './pricing';
import { parseTelemetryContent } from './telemetry-parser';

/**
 * Load and parse telemetry data from JSONL files
 */
export async function loadTelemetryData(outputDir?: string): Promise<TelemetryEvent[]> {
	const defaultOutputDir = join(homedir(), '.gemini', 'usage');
	const dir = outputDir ?? defaultOutputDir;

	if (!existsSync(dir)) {
		return [];
	}

	const events: TelemetryEvent[] = [];

	try {
		// Read all files in the directory
		const files = readdirSync(dir);

		// Filter for telemetry files (.jsonl files)
		const telemetryFiles = files.filter(file =>
			file.endsWith('.jsonl'),
		);

		for (const fileName of telemetryFiles) {
			const filePath = join(dir, fileName);

			try {
				const content = readFileSync(filePath, 'utf-8');
				const fileEvents = parseTelemetryContent(content);
				events.push(...fileEvents);
			}
			catch {
				logger.warn(`Failed to read telemetry file: ${filePath}`);
			}
		}

		return events;
	}
	catch {
		logger.warn(`Failed to read telemetry directory: ${dir}`);
		return [];
	}
}

/**
 * Extract usage data from telemetry events
 */
export async function extractUsageFromTelemetry(events: TelemetryEvent[], offline = false): Promise<{
	model: string;
	date: string;
	inputTokens: number;
	outputTokens: number;
	cacheCreationTokens: number;
	cacheReadTokens: number;
	cost: number;
}[]> {
	const usageData: {
		model: string;
		date: string;
		inputTokens: number;
		outputTokens: number;
		cacheCreationTokens: number;
		cacheReadTokens: number;
		cost: number;
	}[] = [];

	for (const event of events) {
		// Extract relevant data from telemetry events
		// This will depend on the actual structure of your telemetry data
		if (event.model != null && event.model !== '' && event.timestamp != null && event.timestamp !== '') {
			const date = new Date(event.timestamp).toISOString().split('T')[0]!;
			const model = event.model;
			const inputTokens = event.inputTokens ?? 0;
			const outputTokens = event.outputTokens ?? 0;
			const cacheCreationTokens = 0; // May need to extract from event
			const cacheReadTokens = event.cachedTokens ?? 0;

			// Calculate cost
			const costResult = await calculateCost(
				model,
				inputTokens,
				outputTokens,
				cacheReadTokens,
				event.thoughtsTokens ?? 0,
				event.toolTokens ?? 0,
				offline,
			);
			const cost = costResult?.totalCost ?? 0;

			usageData.push({
				model,
				date,
				inputTokens,
				outputTokens,
				cacheCreationTokens,
				cacheReadTokens,
				cost,
			});
		}
	}

	return usageData;
}

/**
 * Load daily usage data
 */
export async function loadDailyUsageData(outputDir?: string, offline = false): Promise<DailyUsage[]> {
	const events = await loadTelemetryData(outputDir);
	const usageData = await extractUsageFromTelemetry(events, offline);

	// Group by date
	const dailyMap = new Map<string, {
		inputTokens: number;
		outputTokens: number;
		cacheCreationTokens: number;
		cacheReadTokens: number;
		totalCost: number;
		models: Set<string>;
	}>();

	for (const data of usageData) {
		const existing = dailyMap.get(data.date) ?? {
			inputTokens: 0,
			outputTokens: 0,
			cacheCreationTokens: 0,
			cacheReadTokens: 0,
			totalCost: 0,
			models: new Set(),
		};

		existing.inputTokens += data.inputTokens;
		existing.outputTokens += data.outputTokens;
		existing.cacheCreationTokens += data.cacheCreationTokens;
		existing.cacheReadTokens += data.cacheReadTokens;
		existing.totalCost += data.cost;
		existing.models.add(data.model);

		dailyMap.set(data.date, existing);
	}

	// Convert to array and sort by date
	return Array.from(dailyMap.entries())
		.map(([date, data]) => ({
			date,
			inputTokens: data.inputTokens,
			outputTokens: data.outputTokens,
			cacheCreationTokens: data.cacheCreationTokens,
			cacheReadTokens: data.cacheReadTokens,
			totalCost: data.totalCost,
			modelsUsed: Array.from(data.models),
		}))
		.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Load monthly usage data
 */
export async function loadMonthlyUsageData(outputDir?: string, offline = false): Promise<MonthlyUsage[]> {
	const events = await loadTelemetryData(outputDir);
	const usageData = await extractUsageFromTelemetry(events, offline);

	// Group by month (YYYY-MM format)
	const monthlyMap = new Map<string, {
		inputTokens: number;
		outputTokens: number;
		cacheCreationTokens: number;
		cacheReadTokens: number;
		totalCost: number;
		models: Set<string>;
	}>();

	for (const data of usageData) {
		const month = data.date.substring(0, 7); // Extract YYYY-MM from YYYY-MM-DD
		const existing = monthlyMap.get(month) ?? {
			inputTokens: 0,
			outputTokens: 0,
			cacheCreationTokens: 0,
			cacheReadTokens: 0,
			totalCost: 0,
			models: new Set(),
		};

		existing.inputTokens += data.inputTokens;
		existing.outputTokens += data.outputTokens;
		existing.cacheCreationTokens += data.cacheCreationTokens;
		existing.cacheReadTokens += data.cacheReadTokens;
		existing.totalCost += data.cost;
		existing.models.add(data.model);

		monthlyMap.set(month, existing);
	}

	// Convert to array and sort by month
	return Array.from(monthlyMap.entries())
		.map(([month, data]) => ({
			month,
			inputTokens: data.inputTokens,
			outputTokens: data.outputTokens,
			cacheCreationTokens: data.cacheCreationTokens,
			cacheReadTokens: data.cacheReadTokens,
			totalCost: data.totalCost,
			modelsUsed: Array.from(data.models),
		}))
		.sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Calculate totals from daily/monthly data
 */
export function calculateTotals(data: (DailyUsage | MonthlyUsage)[]): Totals {
	return data.reduce(
		(totals, item) => ({
			inputTokens: totals.inputTokens + item.inputTokens,
			outputTokens: totals.outputTokens + item.outputTokens,
			cacheCreationTokens: totals.cacheCreationTokens + item.cacheCreationTokens,
			cacheReadTokens: totals.cacheReadTokens + item.cacheReadTokens,
			totalCost: totals.totalCost + item.totalCost,
		}),
		{
			inputTokens: 0,
			outputTokens: 0,
			cacheCreationTokens: 0,
			cacheReadTokens: 0,
			totalCost: 0,
		},
	);
}
