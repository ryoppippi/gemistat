import type { TelemetryEvent } from './_types.ts';
import { telemetryEventSchema } from './_schemas.ts';

/**
 * Parse OpenTelemetry log records from JSONL content
 */
export function parseTelemetryContent(content: string): TelemetryEvent[] {
	const events: TelemetryEvent[] = [];

	if (content.trim() === '') {
		return events;
	}

	try {
		// Parse OpenTelemetry log records - they are complete JSON objects
		// separated by newlines but formatted across multiple lines
		const jsonObjects = content.trim().split('\n}\n{').map((part, index, array) => {
			if (index === 0) {
				return part + (array.length > 1 ? '}' : '');
			}
			else if (index === array.length - 1) {
				return `{${part}`;
			}
			else {
				return `{${part}}`;
			}
		}).filter(obj => obj.trim() !== '');

		for (const jsonStr of jsonObjects) {
			try {
				const logRecord = JSON.parse(jsonStr) as {
					attributes?: {
						'event.name'?: string;
						'event.timestamp'?: string;
						'model'?: string;
						'input_token_count'?: number;
						'output_token_count'?: number;
						'cached_content_token_count'?: number;
						'thoughts_token_count'?: number;
						'tool_token_count'?: number;
					};
				};

				// Extract telemetry event from OpenTelemetry log record
				if (logRecord.attributes != null) {
					const attrs = logRecord.attributes;
					const eventName = attrs['event.name'];

					// Only process API response events for usage tracking
					if (eventName === 'gemini_cli.api_response') {
						const rawEvent: TelemetryEvent = {
							timestamp: attrs['event.timestamp'] ?? '',
							model: attrs.model,
							inputTokens: attrs.input_token_count,
							outputTokens: attrs.output_token_count,
							cachedTokens: attrs.cached_content_token_count,
							thoughtsTokens: attrs.thoughts_token_count,
							toolTokens: attrs.tool_token_count,
						};

						// Validate the event with Zod schema
						const validationResult = telemetryEventSchema.safeParse(rawEvent);
						if (!validationResult.success) {
							continue; // Skip invalid events silently
						}

						events.push(validationResult.data as TelemetryEvent);
					}
				}
			}
			catch {
				// Skip invalid JSON objects silently - they might be partial records
			}
		}
	}
	catch {
		// Skip invalid content
	}

	return events;
}

if (import.meta.vitest != null) {
	const { describe, it, expect } = import.meta.vitest;

	describe('parseTelemetryContent', () => {
		it('should return empty array for empty content', () => {
			const result = parseTelemetryContent('');
			expect(result).toEqual([]);
		});

		it('should parse single OpenTelemetry log record', () => {
			const content = `{
  "attributes": {
    "session.id": "test-session",
    "event.name": "gemini_cli.api_response",
    "event.timestamp": "2025-08-24T15:01:03.694Z",
    "model": "gemini-2.5-pro",
    "status_code": 200,
    "duration_ms": 2172,
    "input_token_count": 6319,
    "output_token_count": 10,
    "cached_content_token_count": 0,
    "thoughts_token_count": 26,
    "tool_token_count": 0,
    "total_token_count": 6355
  }
}`;

			const result = parseTelemetryContent(content);

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({
				timestamp: '2025-08-24T15:01:03.694Z',
				model: 'gemini-2.5-pro',
				inputTokens: 6319,
				outputTokens: 10,
				cachedTokens: 0,
				thoughtsTokens: 26,
				toolTokens: 0,
			});
		});

		it('should parse multiple OpenTelemetry log records', () => {
			const content = `{
  "attributes": {
    "session.id": "test-session-1",
    "event.name": "gemini_cli.api_response",
    "event.timestamp": "2025-08-24T15:01:03.694Z",
    "model": "gemini-2.5-pro",
    "input_token_count": 100,
    "output_token_count": 20,
    "cached_content_token_count": 5,
    "thoughts_token_count": 10,
    "tool_token_count": 0
  }
}
{
  "attributes": {
    "session.id": "test-session-2",
    "event.name": "gemini_cli.api_response",
    "event.timestamp": "2025-08-24T15:02:03.694Z",
    "model": "gemini-2.5-flash",
    "input_token_count": 200,
    "output_token_count": 40,
    "cached_content_token_count": 10,
    "thoughts_token_count": 5,
    "tool_token_count": 2
  }
}`;

			const result = parseTelemetryContent(content);

			expect(result).toHaveLength(2);
			expect(result[0]).toEqual({
				timestamp: '2025-08-24T15:01:03.694Z',
				model: 'gemini-2.5-pro',
				inputTokens: 100,
				outputTokens: 20,
				cachedTokens: 5,
				thoughtsTokens: 10,
				toolTokens: 0,
			});
			expect(result[1]).toEqual({
				timestamp: '2025-08-24T15:02:03.694Z',
				model: 'gemini-2.5-flash',
				inputTokens: 200,
				outputTokens: 40,
				cachedTokens: 10,
				thoughtsTokens: 5,
				toolTokens: 2,
			});
		});

		it('should ignore non-API response events', () => {
			const content = `{
  "attributes": {
    "session.id": "test-session",
    "event.name": "gemini_cli.config",
    "event.timestamp": "2025-08-24T15:00:59.462Z",
    "model": "gemini-2.5-pro"
  }
}
{
  "attributes": {
    "session.id": "test-session",
    "event.name": "gemini_cli.user_prompt",
    "event.timestamp": "2025-08-24T15:01:01.321Z",
    "prompt_length": 2
  }
}
{
  "attributes": {
    "session.id": "test-session",
    "event.name": "gemini_cli.api_response",
    "event.timestamp": "2025-08-24T15:01:03.694Z",
    "model": "gemini-2.5-pro",
    "input_token_count": 100,
    "output_token_count": 20,
    "cached_content_token_count": 0,
    "thoughts_token_count": 0,
    "tool_token_count": 0
  }
}`;

			const result = parseTelemetryContent(content);

			expect(result).toHaveLength(1);
			const firstResult = result[0];
			expect(firstResult != null).toBe(true);
			if (firstResult != null) {
				expect(firstResult.model).toBe('gemini-2.5-pro');
				expect(firstResult.inputTokens).toBe(100);
			}
		});

		it('should handle invalid JSON gracefully', () => {
			const content = `{
  "attributes": {
    "event.name": "gemini_cli.api_response",
    "invalid": json
  }
}
{
  "attributes": {
    "session.id": "test-session",
    "event.name": "gemini_cli.api_response",
    "event.timestamp": "2025-08-24T15:01:03.694Z",
    "model": "gemini-2.5-pro",
    "input_token_count": 100,
    "output_token_count": 20,
    "cached_content_token_count": 0,
    "thoughts_token_count": 0,
    "tool_token_count": 0
  }
}`;

			const result = parseTelemetryContent(content);

			expect(result).toHaveLength(1);
			const firstResult = result[0];
			if (firstResult != null) {
				expect(firstResult.model).toBe('gemini-2.5-pro');
			}
		});

		it('should handle missing attributes gracefully', () => {
			const content = `{
  "attributes": {
    "session.id": "test-session",
    "event.name": "gemini_cli.api_response",
    "event.timestamp": "2025-08-24T15:01:03.694Z",
    "model": "gemini-2.5-pro"
  }
}`;

			const result = parseTelemetryContent(content);

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({
				timestamp: '2025-08-24T15:01:03.694Z',
				model: 'gemini-2.5-pro',
				inputTokens: undefined,
				outputTokens: undefined,
				cachedTokens: undefined,
				thoughtsTokens: undefined,
				toolTokens: undefined,
			});
		});
	});
}
