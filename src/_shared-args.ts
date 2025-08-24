import type { Args } from 'gunshi';

/**
 * Parses and validates a date argument in YYYYMMDD or YYYY-MM-DD format
 * @param value - Date string to parse
 * @returns Validated date string in YYYYMMDD format
 * @throws TypeError if date format is invalid
 */
function parseDateArg(value: string): string {
	// Support both YYYYMMDD and YYYY-MM-DD formats
	const yyyymmddPattern = /^\d{8}$/;
	const iso8601Pattern = /^\d{4}-\d{2}-\d{2}$/;

	if (yyyymmddPattern.test(value)) {
		return value;
	}

	if (iso8601Pattern.test(value)) {
		return value.replace(/-/g, '');
	}

	throw new TypeError('Date must be in YYYYMMDD or YYYY-MM-DD format');
}

/**
 * Shared command line arguments used across multiple CLI commands
 */
export const sharedArgs = {
	since: {
		type: 'custom',
		short: 's',
		description: 'Filter from date (YYYYMMDD or YYYY-MM-DD format)',
		parse: parseDateArg,
	},
	until: {
		type: 'custom',
		short: 'u',
		description: 'Filter until date (YYYYMMDD or YYYY-MM-DD format)',
		parse: parseDateArg,
	},
	json: {
		type: 'boolean',
		short: 'j',
		description: 'Output in JSON format',
		default: false,
	},
	offline: {
		type: 'boolean',
		negatable: true,
		short: 'O',
		description: 'Use cached pricing data for Gemini models instead of fetching from API',
		default: false,
	},
	debug: {
		type: 'boolean',
		short: 'd',
		description: 'Show debug information',
		default: false,
	},
} as const satisfies Args;

/**
 * Shared command configuration for Gunshi CLI commands
 */
export const sharedCommandConfig = {
	args: sharedArgs,
	toKebab: true,
} as const;
