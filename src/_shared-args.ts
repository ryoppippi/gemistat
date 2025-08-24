import type { Args } from 'gunshi';

/**
 * Shared command line arguments used across multiple CLI commands
 */
export const sharedArgs = {
	since: {
		type: 'string',
		short: 's',
		description: 'Filter from date (YYYY-MM-DD format)',
	},
	until: {
		type: 'string',
		short: 'u',
		description: 'Filter until date (YYYY-MM-DD format)',
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
