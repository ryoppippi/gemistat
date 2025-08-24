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
import { calculateTotals, loadDailyUsageData } from '../data-loader';

export const dailyCommand = define({
	name: 'daily',
	description: 'Show daily usage report',
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

		// Load daily usage data
		const dailyData = await loadDailyUsageData(dir, offline);

		if (dailyData.length === 0) {
			if (json === true) {
				process.stdout.write(`${JSON.stringify([])}\n`);
			}
			else {
				process.stdout.write(`${pc.yellow('No usage data found.')}\n`);
			}
			return;
		}

		// Calculate totals
		const totals = calculateTotals(dailyData);

		if (json === true) {
			// Output JSON format
			const jsonOutput = {
				daily: dailyData,
				totals,
			};
			process.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
		}
		else {
			// Display table format
			process.stdout.write(pc.cyan('Gemini Usage Report - Daily\n\n'));

			const table = createUsageReportTable({
				firstColumnName: 'Date',
				forceCompact: compact,
			});

			// Add daily data rows
			for (const data of dailyData) {
				const row = formatUsageDataRow(data.date, {
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
