import type { DailyUsage, MonthlyUsage, TelemetryEvent, Totals } from './_types';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { calculateCost } from './pricing';

/**
 * Load and parse telemetry data from JSONL files
 */
export async function loadTelemetryData(outputDir?: string): Promise<TelemetryEvent[]> {
	const defaultOutputDir = join(homedir(), '.gemini', 'usage');
	const dir = outputDir || defaultOutputDir;
	const telemetryFile = join(dir, 'gemini-telemetry.jsonl');

	if (!existsSync(telemetryFile)) {
		return [];
	}

	try {
		const content = readFileSync(telemetryFile, 'utf-8');
		const lines = content.trim().split('\n').filter(line => line.trim());
		const events: TelemetryEvent[] = [];

		for (const line of lines) {
			try {
				const event = JSON.parse(line);
				events.push(event);
			}
			catch (error) {
				console.warn(`Failed to parse telemetry line: ${line}`);
			}
		}

		return events;
	}
	catch (error) {
		console.warn(`Failed to read telemetry file: ${telemetryFile}`);
		return [];
	}
}

/**
 * Extract usage data from telemetry events
 */
export async function extractUsageFromTelemetry(events: TelemetryEvent[]): Promise<{
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
		if (event.model && event.timestamp) {
			const date = new Date(event.timestamp).toISOString().split('T')[0]!;
			const model = event.model;
			const inputTokens = event.inputTokens || 0;
			const outputTokens = event.outputTokens || 0;
			const cacheCreationTokens = 0; // May need to extract from event
			const cacheReadTokens = event.cachedTokens || 0;

			// Calculate cost
			const costResult = await calculateCost(
				model,
				inputTokens,
				outputTokens,
				cacheReadTokens,
				event.thoughtsTokens || 0,
				event.toolTokens || 0,
			);
			const cost = costResult?.totalCost || 0;

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
export async function loadDailyUsageData(outputDir?: string): Promise<DailyUsage[]> {
	const events = await loadTelemetryData(outputDir);
	const usageData = await extractUsageFromTelemetry(events);

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
		const existing = dailyMap.get(data.date) || {
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
export async function loadMonthlyUsageData(outputDir?: string): Promise<MonthlyUsage[]> {
	const events = await loadTelemetryData(outputDir);
	const usageData = await extractUsageFromTelemetry(events);

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
		const existing = monthlyMap.get(month) || {
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
