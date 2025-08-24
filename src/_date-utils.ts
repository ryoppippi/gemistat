/**
 * Date utility functions for filtering usage data by date ranges
 */

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
