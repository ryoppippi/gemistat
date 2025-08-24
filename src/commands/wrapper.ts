import { execSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { define } from 'gunshi';
import { DATE_LOCALE } from '../_consts.ts';

function which(command: string): string | null {
	try {
		return execSync(`which ${command}`, { encoding: 'utf8' }).trim();
	}
	catch {
		return null;
	}
}

export const wrapperCommand = define({
	name: 'wrapper',
	description: 'Run gemini-cli with telemetry tracking',
	args: {},
	async run(ctx) {
		await runGeminiWrapper(ctx.positionals);
	},
});

export async function runGeminiWrapper(geminiArgs: string[]): Promise<void> {
	const geminiPath = which('gemini');
	if (geminiPath == null) {
		throw new Error('Gemini CLI not found. Please install it first.');
	}

	// Configure output directory and files
	const defaultOutputDir = join(homedir(), '.gemini', 'usage');
	const baseOutputDir = process.env.GEMISTAT_OUTPUT_DIR ?? defaultOutputDir;

	// Create date-based directory structure: ~/.gemini/usage/{YYYY-MM-DD}/
	// Use local timezone instead of UTC for date directory
	const now = new Date();
	const dateDir = new Intl.DateTimeFormat(DATE_LOCALE, {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).format(now); // YYYY-MM-DD format in local timezone
	const outputDir = join(baseOutputDir, dateDir);

	// Generate UUID-based telemetry file name
	const uuid = randomUUID();
	const telemetryFileName = `${uuid}.jsonl`;

	// Create date directory if it doesn't exist
	mkdirSync(outputDir, { recursive: true });

	// Construct telemetry file path
	const telemetryFile = join(outputDir, telemetryFileName);

	// Add telemetry flags if not already present
	const telemetryArgs = [
		'--telemetry',
		'--telemetry-target=local',
		'--telemetry-otlp-endpoint=',
		`--telemetry-outfile=${telemetryFile}`,
	];

	// Merge args, preserving user's flags if they conflict
	const finalArgs = [...geminiArgs];
	for (const arg of telemetryArgs) {
		const flagName = arg.split('=')[0];
		if (flagName != null && flagName !== '' && !finalArgs.some(a => a.startsWith(flagName))) {
			finalArgs.push(arg);
		}
	}

	// OpenTelemetry will automatically save telemetry data to the file
	// No need for real-time monitoring - data will be processed by daily/monthly commands

	// Spawn gemini CLI with telemetry enabled
	const child = spawn(geminiPath, finalArgs, {
		stdio: 'inherit',
		env: {
			...process.env,
			// Ensure telemetry is enabled even if disabled in settings
			GEMINI_TELEMETRY_ENABLED: 'true',
		},
	});

	// Return promise that resolves when child process exits
	return new Promise<void>((resolve, reject) => {
		child.on('exit', (code) => {
			if (code === 0 || code === null) {
				resolve();
			}
			else {
				reject(new Error(`Gemini CLI exited with code ${code}`));
			}
		});

		child.on('error', (error) => {
			reject(error);
		});

		process.on('SIGINT', () => {
			child.kill('SIGINT');
			process.exit(0);
		});

		process.on('SIGTERM', () => {
			child.kill('SIGTERM');
			process.exit(0);
		});
	});
}
