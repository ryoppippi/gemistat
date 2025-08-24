import process from 'node:process';
import Table from 'cli-table3';
import pc from 'picocolors';
import stringWidth from 'string-width';
import { logger } from './logger';

/**
 * Horizontal alignment options for table cells
 */
export type TableCellAlign = 'left' | 'right' | 'center';

/**
 * Table row data type supporting strings, numbers, and formatted cell objects
 */
export type TableRow = (string | number | { content: string; hAlign?: TableCellAlign })[];

/**
 * Configuration options for creating responsive tables
 */
export type TableOptions = {
	head: string[];
	colAligns?: TableCellAlign[];
	style?: {
		head?: string[];
	};
	dateFormatter?: (dateStr: string) => string;
	compactHead?: string[];
	compactColAligns?: TableCellAlign[];
	compactThreshold?: number;
	forceCompact?: boolean;
};

/**
 * Responsive table class that adapts column widths based on terminal size
 * Automatically adjusts formatting and layout for different screen sizes
 */
export class ResponsiveTable {
	private head: string[];
	private rows: TableRow[] = [];
	private colAligns: TableCellAlign[];
	private style?: { head?: string[] };
	private dateFormatter?: (dateStr: string) => string;
	private compactHead?: string[];
	private compactColAligns?: TableCellAlign[];
	private compactThreshold: number;
	private compactMode = false;
	private forceCompact: boolean;

	constructor(options: TableOptions) {
		this.head = options.head;
		this.colAligns = options.colAligns ?? Array.from({ length: this.head.length }, () => 'left');
		this.style = options.style;
		this.dateFormatter = options.dateFormatter;
		this.compactHead = options.compactHead;
		this.compactColAligns = options.compactColAligns;
		this.compactThreshold = options.compactThreshold ?? 100;
		this.forceCompact = options.forceCompact ?? false;
	}

	push(row: TableRow): void {
		this.rows.push(row);
	}

	private filterRowToCompact(row: TableRow, compactIndices: number[]): TableRow {
		return compactIndices.map(index => row[index] ?? '');
	}

	private getCurrentTableConfig(): { head: string[]; colAligns: TableCellAlign[] } {
		if (this.compactMode && this.compactHead != null && this.compactColAligns != null) {
			return { head: this.compactHead, colAligns: this.compactColAligns };
		}
		return { head: this.head, colAligns: this.colAligns };
	}

	private getCompactIndices(): number[] {
		if (this.compactHead == null || !this.compactMode) {
			return Array.from({ length: this.head.length }, (_, i) => i);
		}

		return this.compactHead.map((compactHeader) => {
			const index = this.head.indexOf(compactHeader);
			if (index < 0) {
				logger.warn(`Warning: Compact header "${compactHeader}" not found in table headers [${this.head.join(', ')}]. Using first column as fallback.`);
				return 0;
			}
			return index;
		});
	}

	isCompactMode(): boolean {
		return this.compactMode;
	}

	toString(): string {
		const terminalWidth = Number.parseInt(process.env.COLUMNS ?? '', 10) || process.stdout.columns || 120;

		this.compactMode = this.forceCompact || (terminalWidth < this.compactThreshold && this.compactHead != null);

		const { head, colAligns } = this.getCurrentTableConfig();
		const compactIndices = this.getCompactIndices();

		const dataRows = this.rows.filter(row => !this.isSeparatorRow(row));
		const processedDataRows = this.compactMode
			? dataRows.map(row => this.filterRowToCompact(row, compactIndices))
			: dataRows;

		const allRows = [head.map(String), ...processedDataRows.map(row => row.map((cell) => {
			if (typeof cell === 'object' && cell != null && 'content' in cell) {
				return String(cell.content);
			}
			return String(cell ?? '');
		}))];

		const contentWidths = head.map((_, colIndex) => {
			const maxLength = Math.max(
				...allRows.map(row => stringWidth(String(row[colIndex] ?? ''))),
			);
			return maxLength;
		});

		const numColumns = head.length;
		const tableOverhead = 3 * numColumns + 1;
		const availableWidth = terminalWidth - tableOverhead;

		const columnWidths = contentWidths.map((width, index) => {
			const align = colAligns[index];
			if (align === 'right') {
				return Math.max(width + 3, 11);
			}
			else if (index === 1) {
				return Math.max(width + 2, 15);
			}
			return Math.max(width + 2, 10);
		});

		const totalRequiredWidth = columnWidths.reduce((sum, width) => sum + width, 0) + tableOverhead;

		if (totalRequiredWidth > terminalWidth) {
			const scaleFactor = availableWidth / columnWidths.reduce((sum, width) => sum + width, 0);
			const adjustedWidths = columnWidths.map((width, index) => {
				const align = colAligns[index];
				let adjustedWidth = Math.floor(width * scaleFactor);

				if (align === 'right') {
					adjustedWidth = Math.max(adjustedWidth, 10);
				}
				else if (index === 0) {
					adjustedWidth = Math.max(adjustedWidth, 10);
				}
				else if (index === 1) {
					adjustedWidth = Math.max(adjustedWidth, 12);
				}
				else {
					adjustedWidth = Math.max(adjustedWidth, 8);
				}

				return adjustedWidth;
			});

			const table = new Table({
				head,
				style: this.style,
				colAligns,
				colWidths: adjustedWidths,
				wordWrap: true,
				wrapOnWordBoundary: true,
			});

			for (const row of this.rows) {
				if (this.isSeparatorRow(row)) {
					continue;
				}
				else {
					let processedRow = row.map((cell, index) => {
						if (index === 0 && this.dateFormatter != null && typeof cell === 'string' && this.isDateString(cell)) {
							return this.dateFormatter(cell);
						}
						return cell;
					});

					if (this.compactMode) {
						processedRow = this.filterRowToCompact(processedRow, compactIndices);
					}

					table.push(processedRow);
				}
			}

			return table.toString();
		}
		else {
			const table = new Table({
				head,
				style: this.style,
				colAligns,
				colWidths: columnWidths,
				wordWrap: true,
				wrapOnWordBoundary: true,
			});

			for (const row of this.rows) {
				if (this.isSeparatorRow(row)) {
					continue;
				}
				else {
					const processedRow = this.compactMode
						? this.filterRowToCompact(row, compactIndices)
						: row;
					table.push(processedRow);
				}
			}

			return table.toString();
		}
	}

	private isSeparatorRow(row: TableRow): boolean {
		return row.every((cell) => {
			if (typeof cell === 'object' && cell != null && 'content' in cell) {
				return cell.content === '' || /^─+$/.test(cell.content);
			}
			return typeof cell === 'string' && (cell === '' || /^─+$/.test(cell));
		});
	}

	private isDateString(text: string): boolean {
		return /^\d{4}-\d{2}-\d{2}$/.test(text);
	}
}

/**
 * Formats a number with locale-specific thousand separators
 */
export function formatNumber(num: number): string {
	return num.toLocaleString('en-US');
}

/**
 * Formats a number as USD currency with dollar sign and 2 decimal places
 */
export function formatCurrency(amount: number): string {
	return `$${amount.toFixed(2)}`;
}

/**
 * Formats Gemini model names into a shorter, more readable format
 */
function formatModelName(modelName: string): string {
	// Handle gemini models like "gemini-2.0-flash-exp" -> "gemini-2.0-flash-exp"
	// Keep full name for Gemini models for now
	return modelName;
}

/**
 * Formats an array of model names for display as a comma-separated string
 */
export function formatModelsDisplay(models: string[]): string {
	const uniqueModels = [...new Set(models.map(formatModelName))];
	return uniqueModels.sort().join(', ');
}

/**
 * Formats an array of model names for display with each model on a new line
 */
export function formatModelsDisplayMultiline(models: string[]): string {
	const uniqueModels = [...new Set(models.map(formatModelName))];
	return uniqueModels.sort().map(model => `- ${model}`).join('\n');
}

/**
 * Configuration options for creating usage report tables
 */
export type UsageReportConfig = {
	firstColumnName: string;
	includeLastActivity?: boolean;
	dateFormatter?: (dateStr: string) => string;
	forceCompact?: boolean;
};

/**
 * Standard usage data structure for table rows
 */
export type UsageData = {
	inputTokens: number;
	outputTokens: number;
	cacheCreationTokens: number;
	cacheReadTokens: number;
	totalCost: number;
	modelsUsed?: string[];
};

/**
 * Creates a standard usage report table with consistent styling and layout
 */
export function createUsageReportTable(config: UsageReportConfig): ResponsiveTable {
	const baseHeaders = [
		config.firstColumnName,
		'Models',
		'Input',
		'Output',
		'Cache Create',
		'Cache Read',
		'Total Tokens',
		'Cost (USD)',
	];

	const baseAligns: TableCellAlign[] = [
		'left',
		'left',
		'right',
		'right',
		'right',
		'right',
		'right',
		'right',
	];

	const compactHeaders = [
		config.firstColumnName,
		'Models',
		'Input',
		'Output',
		'Cost (USD)',
	];

	const compactAligns: TableCellAlign[] = [
		'left',
		'left',
		'right',
		'right',
		'right',
	];

	if (config.includeLastActivity ?? false) {
		baseHeaders.push('Last Activity');
		baseAligns.push('left');
		compactHeaders.push('Last Activity');
		compactAligns.push('left');
	}

	return new ResponsiveTable({
		head: baseHeaders,
		style: { head: ['cyan'] },
		colAligns: baseAligns,
		dateFormatter: config.dateFormatter,
		compactHead: compactHeaders,
		compactColAligns: compactAligns,
		compactThreshold: 100,
		forceCompact: config.forceCompact,
	});
}

/**
 * Formats a usage data row for display in the table
 */
export function formatUsageDataRow(
	firstColumnValue: string,
	data: UsageData,
	lastActivity?: string,
): (string | number)[] {
	const totalTokens = data.inputTokens + data.outputTokens + data.cacheCreationTokens + data.cacheReadTokens;

	const row: (string | number)[] = [
		firstColumnValue,
		data.modelsUsed != null ? formatModelsDisplayMultiline(data.modelsUsed) : '',
		formatNumber(data.inputTokens),
		formatNumber(data.outputTokens),
		formatNumber(data.cacheCreationTokens),
		formatNumber(data.cacheReadTokens),
		formatNumber(totalTokens),
		formatCurrency(data.totalCost),
	];

	if (lastActivity !== undefined) {
		row.push(lastActivity);
	}

	return row;
}

/**
 * Creates a totals row with yellow highlighting
 */
export function formatTotalsRow(totals: UsageData, includeLastActivity = false): (string | number)[] {
	const totalTokens = totals.inputTokens + totals.outputTokens + totals.cacheCreationTokens + totals.cacheReadTokens;

	const row: (string | number)[] = [
		pc.yellow('Total'),
		'',
		pc.yellow(formatNumber(totals.inputTokens)),
		pc.yellow(formatNumber(totals.outputTokens)),
		pc.yellow(formatNumber(totals.cacheCreationTokens)),
		pc.yellow(formatNumber(totals.cacheReadTokens)),
		pc.yellow(formatNumber(totalTokens)),
		pc.yellow(formatCurrency(totals.totalCost)),
	];

	if (includeLastActivity) {
		row.push('');
	}

	return row;
}

/**
 * Adds an empty separator row to the table for visual separation
 */
export function addEmptySeparatorRow(table: ResponsiveTable, columnCount: number): void {
	const emptyRow = Array.from({ length: columnCount }, () => '');
	table.push(emptyRow);
}
