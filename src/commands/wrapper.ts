import { execSync, spawn } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { define } from 'gunshi';
import { calculateCost } from '../pricing';
import { StatsDisplay } from '../stats-display';
import { TelemetryWatcher } from '../telemetry-watcher';

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
	const outputDir = process.env.GEMINI_USAGE_OUTPUT_DIR || defaultOutputDir;
	const telemetryFileName = process.env.GEMINI_USAGE_TELEMETRY_FILE || 'gemini-telemetry.jsonl';
	const debugLogFileName = process.env.GEMINI_USAGE_DEBUG_FILE || 'gemini-usage-debug.log';

	// Create output directory if it doesn't exist
	mkdirSync(outputDir, { recursive: true });

	// Construct full file paths
	const telemetryFile = join(outputDir, telemetryFileName);
	const debugLogFile = join(outputDir, debugLogFileName);

	const logDebug = (message: string): void => {
		const timestamp = new Date().toISOString();
		appendFileSync(debugLogFile, `[${timestamp}] ${message}\n`);
	};

	logDebug(`Starting gemini-usage wrapper`);
	logDebug(`Telemetry file: ${telemetryFile}`);

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
		if (flagName && !finalArgs.some(a => a.startsWith(flagName))) {
			finalArgs.push(arg);
		}
	}

	logDebug(`Final args: ${JSON.stringify(finalArgs)}`);

	// Initialize telemetry watcher and stats display (but don't show stats in wrapper mode)
	const watcher = new TelemetryWatcher(telemetryFile);
	const display = new StatsDisplay();

	// Connect watcher events to display (for logging only)
	watcher.on('token-usage', (data) => {
		logDebug(`Token usage event: ${JSON.stringify(data)}`);
		display.updateTokenUsage(data);
	});

	watcher.on('api-response', async (data) => {
		logDebug(`API response event: ${JSON.stringify(data)}`);
		await display.updateApiResponse(data);

		// Log cost calculation
		const cost = await calculateCost(
			data.model,
			data.inputTokenCount,
			data.outputTokenCount,
			data.cachedTokenCount || 0,
			data.thoughtsTokenCount || 0,
			data.toolTokenCount || 0,
		);

		if (cost) {
			logDebug(`Cost calculation for ${data.model}: ${JSON.stringify(cost)}`);
			logDebug(`Total cost so far: $${cost.totalCost.toFixed(6)}`);
		}
		else {
			logDebug(`No pricing data available for model: ${data.model}`);
		}
	});

	watcher.on('raw-event', (event) => {
		logDebug(`Raw telemetry event: ${JSON.stringify(event)}`);
	});

	// Start watching for telemetry data
	watcher.start();

	// Spawn gemini CLI with telemetry enabled
	const child = spawn(geminiPath, finalArgs, {
		stdio: 'inherit',
		env: {
			...process.env,
			// Ensure telemetry is enabled even if disabled in settings
			GEMINI_TELEMETRY_ENABLED: 'true',
		},
	});

	// Clean up on exit
	function cleanup(): void {
		logDebug('Cleaning up...');
		watcher.stop();

		// Log final statistics to debug file
		const stats = display.getStats();
		if (stats.size > 0) {
			logDebug('=== Final Session Statistics ===');
			let totalCost = 0;
			for (const [model, modelStats] of stats) {
				logDebug(`Model: ${model}`);
				logDebug(`  Requests: ${modelStats.requests}`);
				logDebug(`  Input tokens: ${modelStats.inputTokens}`);
				logDebug(`  Output tokens: ${modelStats.outputTokens}`);
				logDebug(`  Total tokens: ${modelStats.totalTokens}`);
				logDebug(`  Cost: $${modelStats.totalCost.toFixed(6)}`);
				totalCost += modelStats.totalCost;
			}
			logDebug(`Total session cost: $${totalCost.toFixed(6)}`);
			logDebug('================================');
		}

		// Don't show final stats in wrapper mode to keep it silent
		logDebug('Cleanup complete');
	}

	return new Promise<void>((resolve, reject) => {
		child.on('exit', (code) => {
			cleanup();
			if (code === 0 || code === null) {
				resolve();
			}
			else {
				reject(new Error(`Gemini CLI exited with code ${code}`));
			}
		});

		child.on('error', (error) => {
			cleanup();
			reject(error);
		});

		process.on('SIGINT', () => {
			child.kill('SIGINT');
			cleanup();
			process.exit(0);
		});

		process.on('SIGTERM', () => {
			child.kill('SIGTERM');
			cleanup();
			process.exit(0);
		});
	});
}
