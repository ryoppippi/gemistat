import { define } from 'gunshi';
import pc from 'picocolors';
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
	args: {
		dir: {
			type: 'string',
			short: 'd',
			description: 'Directory containing telemetry files',
		},
		json: {
			type: 'boolean',
			short: 'j',
			description: 'Output in JSON format',
		},
		compact: {
			type: 'boolean',
			short: 'c',
			description: 'Force compact table display',
		},
	},
	async run(ctx) {
		const { dir, json, compact } = ctx.values;

		// Load daily usage data
		const dailyData = await loadDailyUsageData(dir);

		if (dailyData.length === 0) {
			if (json) {
				console.log(JSON.stringify([]));
			}
			else {
				console.log(pc.yellow('No usage data found.'));
			}
			return;
		}

		// Calculate totals
		const totals = calculateTotals(dailyData);

		if (json) {
			// Output JSON format
			const jsonOutput = {
				daily: dailyData,
				totals,
			};
			console.log(JSON.stringify(jsonOutput, null, 2));
		}
		else {
			// Display table format
			console.log(pc.cyan('Gemini Usage Report - Daily\n'));

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

			console.log(table.toString());

			// Show guidance if in compact mode
			if (table.isCompactMode()) {
				console.log(pc.gray('\nRunning in Compact Mode'));
				console.log(pc.gray('Expand terminal width to see all columns'));
			}
		}
	},
});
