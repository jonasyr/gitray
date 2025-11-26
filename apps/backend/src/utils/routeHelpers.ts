import { CommitFilterOptions } from '@gitray/shared-types';

/**
 * Builds CommitFilterOptions from Express query parameters.
 * Only includes defined properties to ensure consistent cache keys.
 *
 * This helper eliminates duplication across route handlers that need to
 * construct filter objects from query parameters. By excluding undefined
 * properties, it ensures that cache key generation is consistent regardless
 * of which optional filters are provided.
 *
 * @param query - Express request query object containing filter parameters
 * @returns CommitFilterOptions with only defined properties
 *
 * @example
 * const filters = buildCommitFilters({
 *   author: 'john',
 *   fromDate: '2024-01-01',
 *   toDate: '2024-12-31'
 * });
 * // Returns: { author: 'john', fromDate: '2024-01-01', toDate: '2024-12-31' }
 */
export function buildCommitFilters(query: {
  author?: string;
  authors?: string;
  fromDate?: string;
  toDate?: string;
}): CommitFilterOptions {
  const filters: CommitFilterOptions = {};

  if (query.author) {
    filters.author = query.author;
  }
  if (query.authors) {
    filters.authors = query.authors.split(',').map((a) => a.trim());
  }
  if (query.fromDate) {
    filters.fromDate = query.fromDate;
  }
  if (query.toDate) {
    filters.toDate = query.toDate;
  }

  return filters;
}
