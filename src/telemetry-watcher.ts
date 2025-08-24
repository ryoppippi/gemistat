import { EventEmitter } from 'node:events';
import { existsSync, readFileSync, statSync } from 'node:fs';

export type TokenUsageEvent = {
	model: string;
	type: 'input' | 'output' | 'thought' | 'cache' | 'tool';
	count: number;
	sessionId?: string;
	timestamp: string;
};

export type ApiResponseEvent = {
	model: string;
	inputTokenCount: number;
	outputTokenCount: number;
	cachedTokenCount?: number;
	thoughtsTokenCount?: number;
	toolTokenCount?: number;
	totalTokenCount?: number;
	durationMs?: number;
	timestamp: string;
};

export class TelemetryWatcher extends EventEmitter {
	private filePath: string;
	private watching = false;
	private lastPosition = 0;
	private watchInterval?: Timer;
	private partialData = '';

	constructor(filePath: string) {
		super();
		this.filePath = filePath;
	}

	start() {
		if (this.watching) { return; }
		this.watching = true;

		// Check for new data every 100ms
		this.watchInterval = setInterval(() => {
			this.checkForNewData();
		}, 100);
	}

	stop() {
		this.watching = false;
		if (this.watchInterval) {
			clearInterval(this.watchInterval);
			this.watchInterval = undefined;
		}
	}

	private checkForNewData() {
		if (!existsSync(this.filePath)) { return; }

		const stats = statSync(this.filePath);
		if (stats.size <= this.lastPosition) { return; }

		// Read new data from the file
		const buffer = readFileSync(this.filePath);
		const newData = buffer.toString('utf8', this.lastPosition, stats.size);

		// Combine with any partial data from previous read
		const fullData = this.partialData + newData;

		// Split by closing brace followed by opening brace (JSON object boundaries)
		// This handles pretty-printed JSON objects
		const parts = fullData.split(/\}\s*\{/);

		for (let i = 0; i < parts.length; i++) {
			let part = parts[i];
			if (part == null) { continue; }

			// Add back the braces we split on
			if (i > 0) { part = `{${part}`; }
			if (i < parts.length - 1) { part = `${part}}`; }

			// Try to parse as JSON
			try {
				const event = JSON.parse(part);
				this.processEvent(event);
			}
			catch (e) {
				// If it's the last part and parsing failed, it might be incomplete
				if (i === parts.length - 1) {
					this.partialData = part;
				}
			}
		}

		// If we successfully parsed everything, clear partial data
		if (parts.length === 1) {
			try {
				JSON.parse(fullData);
				this.partialData = '';
			}
			catch {
				this.partialData = fullData;
			}
		}

		this.lastPosition = stats.size;
	}

	private processEvent(event: any) {
		// The actual event data is nested in 'attributes' property
		const attrs = event.attributes || {};
		const eventName = attrs['event.name'];

		// Check for token usage metric
		if (eventName === 'gemini_cli.token.usage' && attrs.value) {
			const tokenUsage: TokenUsageEvent = {
				model: attrs.model || 'unknown',
				type: attrs.type || 'unknown',
				count: attrs.value,
				sessionId: attrs['session.id'],
				timestamp: attrs['event.timestamp'] || new Date().toISOString(),
			};
			this.emit('token-usage', tokenUsage);
		}

		// Check for API response event
		if (eventName === 'gemini_cli.api_response') {
			const apiResponse: ApiResponseEvent = {
				model: attrs.model || 'unknown',
				inputTokenCount: attrs.input_token_count || 0,
				outputTokenCount: attrs.output_token_count || 0,
				cachedTokenCount: attrs.cached_content_token_count,
				thoughtsTokenCount: attrs.thoughts_token_count,
				toolTokenCount: attrs.tool_token_count,
				totalTokenCount: attrs.total_token_count,
				durationMs: attrs.duration_ms,
				timestamp: attrs['event.timestamp'] || new Date().toISOString(),
			};
			this.emit('api-response', apiResponse);
		}

		// Emit raw event for debugging (but only if it has the right structure)
		if (eventName) {
			this.emit('raw-event', attrs);
		}
	}
}
