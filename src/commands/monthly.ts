import process from 'node:process';
import { define } from 'gunshi';
import pc from 'picocolors';
import { sharedCommandConfig } from '../_shared-args';
import {
	addEmptySeparatorRow,
	createUsageReportTable,
	formatTotalsRow,
	formatUsageDataRow,
} from '../_table';
import { calculateTotals, loadMonthlyUsageData } from '../data-loader';
import { logger } from '../logger';

export const monthlyCommand = define({
	name: 'monthly',
	description: 'Show monthly usage report',
	...sharedCommandConfig,
	args: {
		...sharedCommandConfig.args,
		dir: {
			type: 'string',
			short: 'd',
			description: 'Directory containing telemetry files',
		},
		compact: {
			type: 'boolean',
			short: 'c',
			description: 'Force compact table display',
		},
	},
	async run(ctx) {
		const { dir, json, compact, offline } = ctx.values;

		// Load monthly usage data
		const monthlyData = await loadMonthlyUsageData(dir, offline);

		if (monthlyData.length === 0) {
			if (json === true) {
				process.stdout.write(`${JSON.stringify([])}\n`);
			}
			else {
				process.stdout.write(`${pc.yellow('No usage data found.')}\n`);
			}
			return;
		}

		// Calculate totals
		const totals = calculateTotals(monthlyData);

		if (json === true) {
			// Output JSON format
			const jsonOutput = {
				monthly: monthlyData,
				totals,
			};
			process.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
		}
		else {
			// Display table format
			logger.box('Gemini Usage Report - Monthly');

			const table = createUsageReportTable({
				firstColumnName: 'Month',
				forceCompact: compact,
			});

			// Add monthly data rows
			for (const data of monthlyData) {
				const row = formatUsageDataRow(data.month, {
					inputTokens: data.inputTokens,
					outputTokens: data.outputTokens,
					cacheCreationTokens: data.cacheCreationTokens,
					cacheReadTokens: data.cacheReadTokens,
					totalCost: data.totalCost,
					modelsUsed: data.modelsUsed,
				});
				table.push(row);
			}

			// Add separator and totals
			addEmptySeparatorRow(table, 8);
			const totalsRow = formatTotalsRow({
				inputTokens: totals.inputTokens,
				outputTokens: totals.outputTokens,
				cacheCreationTokens: totals.cacheCreationTokens,
				cacheReadTokens: totals.cacheReadTokens,
				totalCost: totals.totalCost,
			});
			table.push(totalsRow);

			process.stdout.write(`${table.toString()}\n`);

			// Show guidance if in compact mode
			if (table.isCompactMode()) {
				process.stdout.write(pc.gray('\nRunning in Compact Mode\n'));
				process.stdout.write(pc.gray('Expand terminal width to see all columns\n'));
			}
		}
	},
});
