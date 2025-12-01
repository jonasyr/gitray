import crypto from 'crypto';

/**
 * Generate stable 16-character hash for repository URLs.
 *
 * IMPORTANT: MD5 is used here for cache key generation ONLY, not for security purposes.
 * Performance is prioritized over cryptographic strength for cache keys.
 * This provides deterministic, collision-resistant keys for the caching layer.
 *
 * @param url - Repository URL to hash
 * @returns 16-character hexadecimal hash string
 *
 * @example
 * hashUrl('https://github.com/user/repo') // => '5d41402abc4b2a76'
 */
export function hashUrl(url: string): string {
  // SAFE: MD5 used for cache key generation only (not security-sensitive)
  // Performance is prioritized over cryptographic strength for cache keys
  return crypto.createHash('md5').update(url).digest('hex').slice(0, 16);
}

/**
 * Generate stable 8-character hash for filter option objects.
 *
 * IMPORTANT: MD5 is used here for cache key generation ONLY, not for security purposes.
 * The function normalizes the object by sorting keys before hashing to ensure
 * deterministic output regardless of property order.
 *
 * @param obj - Filter options object to hash
 * @returns 8-character hexadecimal hash string
 *
 * @example
 * hashObject({ author: 'Alice', fromDate: '2024-01-01' }) // => '3f8e2a1c'
 */
export function hashObject(obj: any): string {
  // Normalize object by sorting keys to ensure deterministic hashing
  const str = JSON.stringify(
    obj,
    Object.keys(obj).sort((a, b) => a.localeCompare(b))
  );

  // SAFE: MD5 used for cache key generation only (not security-sensitive)
  // Performance is prioritized over cryptographic strength for cache keys
  return crypto.createHash('md5').update(str).digest('hex').slice(0, 8);
}
