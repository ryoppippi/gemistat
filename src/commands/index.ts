import process from 'node:process';
import { cli } from 'gunshi';
import { description, name, version } from '../../package.json';
import { dailyCommand } from './daily.ts';
import { monthlyCommand } from './monthly.ts';
import { wrapperCommand } from './wrapper.ts';

// Re-export all commands for easy importing
export { dailyCommand, monthlyCommand, wrapperCommand };

/**
 * Command entries as tuple array
 */
export const subCommandUnion = [
	['daily', dailyCommand],
	['monthly', monthlyCommand],
	['wrapper', wrapperCommand],
] as const;

/**
 * Available command names extracted from union
 */
export type CommandName = typeof subCommandUnion[number][0];

/**
 * Map of available CLI subcommands
 */
const subCommands = new Map();
for (const [name, command] of subCommandUnion) {
	subCommands.set(name, command);
}

/**
 * Default command when no subcommand is specified (defaults to wrapper)
 */
const mainCommand = wrapperCommand;

export async function run(): Promise<void> {
	await cli(process.argv.slice(2), mainCommand, {
		name,
		version,
		description,
		subCommands,
		renderHeader: null,
	});
}
