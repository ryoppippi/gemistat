import { define } from 'gunshi';
import pc from 'picocolors';
import {
	addEmptySeparatorRow,
	createUsageReportTable,
	formatTotalsRow,
	formatUsageDataRow,
} from '../_table';
import { calculateTotals, loadMonthlyUsageData } from '../data-loader';

export const monthlyCommand = define({
	name: 'monthly',
	description: 'Show monthly usage report',
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

		// Load monthly usage data
		const monthlyData = await loadMonthlyUsageData(dir);

		if (monthlyData.length === 0) {
			if (json) {
				console.log(JSON.stringify([]));
			}
			else {
				console.log(pc.yellow('No usage data found.'));
			}
			return;
		}

		// Calculate totals
		const totals = calculateTotals(monthlyData);

		if (json) {
			// Output JSON format
			const jsonOutput = {
				monthly: monthlyData,
				totals,
			};
			console.log(JSON.stringify(jsonOutput, null, 2));
		}
		else {
			// Display table format
			console.log(pc.cyan('Gemini Usage Report - Monthly\n'));

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

			console.log(table.toString());

			// Show guidance if in compact mode
			if (table.isCompactMode()) {
				console.log(pc.gray('\nRunning in Compact Mode'));
				console.log(pc.gray('Expand terminal width to see all columns'));
			}
		}
	},
});
