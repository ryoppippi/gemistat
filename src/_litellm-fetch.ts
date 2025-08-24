/**
 * Shared LiteLLM pricing data fetch utility
 * Eliminates duplication between gemistat and ccusage
 */

import type { LiteLLMModelData } from './_schemas.ts';
import { LITELLM_PRICING_URL } from './_consts.ts';
import { liteLLMModelDataSchema } from './_schemas.ts';

/**
 * Fetches raw pricing data from LiteLLM API
 * Returns the complete dataset for filtering by individual projects
 */
export async function fetchLiteLLMData(): Promise<Record<string, LiteLLMModelData>> {
	const response = await fetch(LITELLM_PRICING_URL);
	if (!response.ok) {
		throw new Error(`Failed to fetch pricing data: ${response.statusText}`);
	}

	const data = await response.json() as Record<string, unknown>;
	const result: Record<string, LiteLLMModelData> = {};

	// Filter to only include models with valid pricing data
	for (const [modelName, modelData] of Object.entries(data)) {
		const validationResult = liteLLMModelDataSchema.safeParse(modelData);
		if (validationResult.success) {
			// Only include models that have pricing information
			const model = validationResult.data;
			if (model.input_cost_per_token != null || model.output_cost_per_token != null) {
				result[modelName] = model;
			}
		}
	}

	return result;
}

/**
 * Filters LiteLLM data for specific model patterns
 */
export function filterModels(
	data: Record<string, LiteLLMModelData>,
	filterFn: (modelName: string) => boolean,
): Record<string, LiteLLMModelData> {
	const result: Record<string, LiteLLMModelData> = {};

	for (const [modelName, modelData] of Object.entries(data)) {
		if (filterFn(modelName)) {
			result[modelName] = modelData;
		}
	}

	return result;
}

/**
 * Pre-built filter for Gemini models (used by gemistat)
 */
export function isGeminiModel(modelName: string): boolean {
	const lower = modelName.toLowerCase();
	return lower.includes('gemini') || lower.includes('google');
}

/**
 * Pre-built filter for Claude models (used by ccusage)
 */
export function isClaudeModel(modelName: string): boolean {
	return modelName.startsWith('claude-');
}

if (import.meta.vitest != null) {
	describe('_litellm-fetch', () => {
		describe('isGeminiModel', () => {
			it('should return true for gemini models', () => {
				expect(isGeminiModel('gemini-pro')).toBe(true);
				expect(isGeminiModel('gemini-1.5-pro')).toBe(true);
				expect(isGeminiModel('GEMINI-PRO')).toBe(true);
			});

			it('should return true for google models', () => {
				expect(isGeminiModel('google/gemini-pro')).toBe(true);
				expect(isGeminiModel('GOOGLE-MODEL')).toBe(true);
			});

			it('should return false for non-gemini models', () => {
				expect(isGeminiModel('claude-3')).toBe(false);
				expect(isGeminiModel('gpt-4')).toBe(false);
				expect(isGeminiModel('random-model')).toBe(false);
			});
		});

		describe('isClaudeModel', () => {
			it('should return true for claude models', () => {
				expect(isClaudeModel('claude-3-opus')).toBe(true);
				expect(isClaudeModel('claude-3-sonnet')).toBe(true);
				expect(isClaudeModel('claude-instant')).toBe(true);
			});

			it('should return false for non-claude models', () => {
				expect(isClaudeModel('gemini-pro')).toBe(false);
				expect(isClaudeModel('gpt-4')).toBe(false);
				expect(isClaudeModel('CLAUDE-3')).toBe(false); // Uppercase doesn't match startsWith
			});
		});

		describe('filterModels', () => {
			const mockData = {
				'gemini-pro': {
					input_cost_per_token: 0.0001,
					output_cost_per_token: 0.0002,
				},
				'claude-3-opus': {
					input_cost_per_token: 0.0003,
					output_cost_per_token: 0.0004,
				},
				'gpt-4': {
					input_cost_per_token: 0.0005,
					output_cost_per_token: 0.0006,
				},
			};

			it('should filter models by predicate function', () => {
				const geminiOnly = filterModels(mockData, isGeminiModel);
				expect(Object.keys(geminiOnly)).toEqual(['gemini-pro']);
				expect(geminiOnly['gemini-pro']).toEqual(mockData['gemini-pro']);
			});

			it('should filter claude models', () => {
				const claudeOnly = filterModels(mockData, isClaudeModel);
				expect(Object.keys(claudeOnly)).toEqual(['claude-3-opus']);
				expect(claudeOnly['claude-3-opus']).toEqual(mockData['claude-3-opus']);
			});

			it('should return empty object when no models match', () => {
				const noMatch = filterModels(mockData, () => false);
				expect(noMatch).toEqual({});
			});
		});

		describe('fetchLiteLLMData', () => {
			it('should fetch and filter pricing data successfully', async () => {
				const mockResponse = {
					'gemini-pro': {
						input_cost_per_token: 0.0001,
						output_cost_per_token: 0.0002,
						max_tokens: 8000,
					},
					'invalid-model': {
						// No pricing data
						description: 'some model without pricing',
					},
					'claude-3': {
						input_cost_per_token: 0.0003,
						output_cost_per_token: 0.0004,
					},
				};

				globalThis.fetch = vi.fn().mockResolvedValueOnce({
					ok: true,
					json: async () => mockResponse,
				});

				const result = await fetchLiteLLMData();

				expect(fetch).toHaveBeenCalledWith(expect.stringContaining('litellm'));
				expect(result).toEqual({
					'gemini-pro': {
						input_cost_per_token: 0.0001,
						output_cost_per_token: 0.0002,
						max_tokens: 8000,
					},
					'claude-3': {
						input_cost_per_token: 0.0003,
						output_cost_per_token: 0.0004,
					},
				});
				// Should exclude 'invalid-model' because it has no pricing data
				expect(result['invalid-model']).toBeUndefined();
			});

			it('should throw error when fetch fails', async () => {
				globalThis.fetch = vi.fn().mockResolvedValueOnce({
					ok: false,
					statusText: 'Internal Server Error',
				});

				await expect(fetchLiteLLMData()).rejects.toThrow('Failed to fetch pricing data: Internal Server Error');
			});

			it('should handle models with only input pricing', async () => {
				const mockResponse = {
					'input-only-model': {
						input_cost_per_token: 0.0001,
						// No output_cost_per_token
					},
				};

				globalThis.fetch = vi.fn().mockResolvedValueOnce({
					ok: true,
					json: async () => mockResponse,
				});

				const result = await fetchLiteLLMData();

				expect(result['input-only-model']).toEqual({
					input_cost_per_token: 0.0001,
				});
			});

			it('should handle models with only output pricing', async () => {
				const mockResponse = {
					'output-only-model': {
						output_cost_per_token: 0.0002,
						// No input_cost_per_token
					},
				};

				globalThis.fetch = vi.fn().mockResolvedValueOnce({
					ok: true,
					json: async () => mockResponse,
				});

				const result = await fetchLiteLLMData();

				expect(result['output-only-model']).toEqual({
					output_cost_per_token: 0.0002,
				});
			});

			it('should exclude null or non-object model data', async () => {
				const mockResponse = {
					'valid-model': {
						input_cost_per_token: 0.0001,
					},
					'null-model': null,
					'string-model': 'invalid',
					'number-model': 123,
				};

				globalThis.fetch = vi.fn().mockResolvedValueOnce({
					ok: true,
					json: async () => mockResponse,
				});

				const result = await fetchLiteLLMData();

				expect(Object.keys(result)).toEqual(['valid-model']);
				expect(result['valid-model']).toEqual({
					input_cost_per_token: 0.0001,
				});
			});
		});
	});
}
