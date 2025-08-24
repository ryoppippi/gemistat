/**
 * Date utility functions for filtering usage data by date ranges
 */
import { DATE_LOCALE } from './_consts.ts';

/**
 * Formats a timestamp to local date in YYYY-MM-DD format
 * @param timestamp - ISO timestamp string
 * @returns Formatted date string in YYYY-MM-DD format using local timezone
 */
export function formatTimestampToLocalDate(timestamp: string): string {
	return new Intl.DateTimeFormat(DATE_LOCALE, {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).format(new Date(timestamp));
}

/**
 * Filters items by date range
 * @param items - Array of items to filter
 * @param getDate - Function to extract date string from item
 * @param since - Start date in YYYYMMDD or YYYY-MM-DD format
 * @param until - End date in YYYYMMDD or YYYY-MM-DD format
 * @returns Filtered array
 */
export function filterByDateRange<T>(
	items: T[],
	getDate: (item: T) => string,
	since?: string,
	until?: string,
): T[] {
	if (since == null && until == null) {
		return items;
	}

	// Normalize since/until to YYYYMMDD format
	const normalizedSince = since?.replace(/-/g, '');
	const normalizedUntil = until?.replace(/-/g, '');

	return items.filter((item) => {
		const dateStr = getDate(item).substring(0, 10).replace(/-/g, ''); // Convert to YYYYMMDD
		if (normalizedSince != null && dateStr < normalizedSince) {
			return false;
		}
		if (normalizedUntil != null && dateStr > normalizedUntil) {
			return false;
		}
		return true;
	});
}

if (import.meta.vitest != null) {
	describe('formatTimestampToLocalDate', () => {
		it('should format UTC timestamp to local date', () => {
			// Test with a UTC timestamp
			const timestamp = '2024-01-15T14:30:45.123Z';
			const result = formatTimestampToLocalDate(timestamp);

			// Result should be in YYYY-MM-DD format
			expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);

			// Should be January 15th in local timezone (might vary by system timezone)
			expect(result.startsWith('2024-01-1')).toBe(true);
		});

		it('should handle different timestamp formats', () => {
			const timestamps = [
				'2024-01-15T00:00:00.000Z',
				'2024-01-15T23:59:59.999Z',
				'2024-01-15T12:00:00Z',
			];

			for (const timestamp of timestamps) {
				const result = formatTimestampToLocalDate(timestamp);
				expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
				expect(result.startsWith('2024-01-1')).toBe(true);
			}
		});

		it('should use local timezone consistently', () => {
			// Test with midnight UTC - result depends on local timezone
			const utcMidnight = '2024-01-15T00:00:00.000Z';
			const result = formatTimestampToLocalDate(utcMidnight);

			// Should be either Jan 14 or Jan 15 depending on timezone
			expect(result).toMatch(/^2024-01-(14|15)$/);
		});
	});

	describe('filterByDateRange', () => {
		const testData = [
			{ id: 1, date: '2024-01-01' },
			{ id: 2, date: '2024-01-02' },
			{ id: 3, date: '2024-01-03' },
			{ id: 4, date: '2024-01-04' },
			{ id: 5, date: '2024-01-05' },
		];

		it('should return all items when no date filters are provided', () => {
			const result = filterByDateRange(testData, item => item.date);
			expect(result).toEqual(testData);
		});

		it('should filter by since date', () => {
			const result = filterByDateRange(testData, item => item.date, '20240103');
			expect(result.map(item => item.id)).toEqual([3, 4, 5]);
		});

		it('should filter by until date', () => {
			const result = filterByDateRange(testData, item => item.date, undefined, '20240103');
			expect(result.map(item => item.id)).toEqual([1, 2, 3]);
		});

		it('should filter by both since and until dates', () => {
			const result = filterByDateRange(testData, item => item.date, '20240102', '20240104');
			expect(result.map(item => item.id)).toEqual([2, 3, 4]);
		});

		it('should handle YYYY-MM-DD format for since/until', () => {
			const result = filterByDateRange(testData, item => item.date, '2024-01-02', '2024-01-04');
			expect(result.map(item => item.id)).toEqual([2, 3, 4]);
		});

		it('should handle timestamp format dates', () => {
			const timestampData = [
				{ id: 1, date: '2024-01-01T10:00:00Z' },
				{ id: 2, date: '2024-01-02T10:00:00Z' },
				{ id: 3, date: '2024-01-03T10:00:00Z' },
			];
			const result = filterByDateRange(timestampData, item => item.date, '20240102');
			expect(result.map(item => item.id)).toEqual([2, 3]);
		});
	});
}
