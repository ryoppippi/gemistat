import { execSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { define } from 'gunshi';

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
	const outputDir = process.env.GEMISTAT_OUTPUT_DIR ?? defaultOutputDir;

	// Add date prefix to telemetry file name
	const datePrefix = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
	const baseTelemetryFileName = process.env.GEMISTAT_TELEMETRY_FILE ?? 'gemini-telemetry.jsonl';
	const telemetryFileName = `${datePrefix}_${baseTelemetryFileName}`;

	// Create output directory if it doesn't exist
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
