import dns from 'dns';
import { URL } from 'url';
import net from 'net';

const dnsPromises = dns.promises;

// Default allowlist; can be overridden via ALLOWED_GIT_HOSTS env (comma-separated)
const DEFAULT_ALLOWED = ['github.com', 'gitlab.com', 'bitbucket.org'];

function parseAllowedHosts(): string[] {
  const env = process.env.ALLOWED_GIT_HOSTS;
  if (!env) return DEFAULT_ALLOWED;
  return env
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

/**
 * Normalize hostname to prevent bypass via trailing dots or other tricks
 * Uses a safe regex-free approach to prevent ReDoS
 */
function normalizeHostname(hostname: string): string {
  let normalized = hostname.toLowerCase().trim();
  // Remove trailing dots without regex to prevent ReDoS
  while (normalized.endsWith('.')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

/**
 * Check if IPv4 address is private or disallowed
 */
function isPrivateIpv4(octets: number[]): boolean {
  if (octets.length !== 4 || octets.some((n) => Number.isNaN(n))) return true;

  const [o1, o2, o3, o4] = octets;

  // Check for various private/reserved ranges
  const checks = [
    o1 === 127, // 127.0.0.0/8 (loopback)
    o1 === 10, // 10.0.0.0/8 (private)
    o1 === 172 && o2 >= 16 && o2 <= 31, // 172.16.0.0/12 (private)
    o1 === 192 && o2 === 168, // 192.168.0.0/16 (private)
    o1 === 0, // 0.0.0.0/8 (current network)
    o1 === 169 && o2 === 254, // 169.254.0.0/16 (link-local)
    o1 === 255 && o2 === 255 && o3 === 255 && o4 === 255, // broadcast
    o1 >= 224 && o1 <= 239, // 224.0.0.0/4 (multicast)
    o1 >= 240, // 240.0.0.0/4 (reserved)
  ];

  return checks.some((check) => check);
}

/**
 * Check if IPv6 address is private or disallowed
 */
function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();

  // ::1 (loopback)
  if (lower === '::1') return true;
  // :: (unspecified)
  if (lower === '::') return true;
  // link-local fe80::/10
  if (
    lower.startsWith('fe8') ||
    lower.startsWith('fe9') ||
    lower.startsWith('fea') ||
    lower.startsWith('feb')
  ) {
    return true;
  }
  // Unique local fc00::/7
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  // IPv4-mapped IPv6 ::ffff:0:0/96
  if (lower.startsWith('::ffff:')) {
    const v4Part = lower.replace('::ffff:', '');
    if (net.isIP(v4Part) === 4) {
      return isPrivateOrDisallowedIp(v4Part);
    }
    return true;
  }
  // IPv4-compatible IPv6 ::/96 (deprecated)
  if (lower.match(/^::[0-9a-f.]+$/)) {
    return true;
  }
  // Multicast ff00::/8
  if (lower.startsWith('ff')) return true;

  return false;
}

/**
 * Comprehensive check for private, loopback, and link-local IP addresses
 */
function isPrivateOrDisallowedIp(ip: string): boolean {
  // IPv4 checks
  if (net.isIP(ip) === 4) {
    const octets = ip.split('.').map((x) => parseInt(x, 10));
    return isPrivateIpv4(octets);
  }

  // IPv6 checks
  if (net.isIP(ip) === 6) {
    return isPrivateIpv6(ip);
  }

  // Unknown IP format -> treat as disallowed
  return true;
}

/**
 * Validate DNS resolution with DNS rebinding protection
 */
async function validateDnsResolution(hostname: string): Promise<boolean> {
  try {
    const addrs = await dnsPromises.lookup(hostname, {
      all: true,
      verbatim: false,
    });

    if (!addrs || addrs.length === 0) return false;

    // Check all resolved addresses
    for (const a of addrs) {
      if (isPrivateOrDisallowedIp(a.address)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a Git repository URL is safe to clone
 *
 * This function performs comprehensive security checks including:
 * - Protocol validation (https/http)
 * - Hostname allowlist enforcement
 * - DNS resolution with SSRF protection
 * - Private/internal IP blocking
 * - Hostname normalization to prevent bypasses
 *
 * @param value - The repository URL to validate
 * @returns Promise<boolean> - true if URL is safe, false otherwise
 */
export async function isSafeGitUrl(value: string): Promise<boolean> {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return false;
  }

  // Enforce https scheme by default; optionally allow http via env override
  const allowHttp = (process.env.ALLOW_HTTP_GIT || '').toLowerCase() === 'true';
  if (!(u.protocol === 'https:' || (allowHttp && u.protocol === 'http:'))) {
    return false;
  }

  // Disallow userinfo (username:password)
  if (u.username || u.password) return false;

  // Normalize and validate hostname
  const normalized = normalizeHostname(u.hostname);

  // Check against allowlist
  const allowed = parseAllowedHosts();
  if (!allowed.includes(normalized)) {
    return false;
  }

  // Validate DNS resolution and check for SSRF
  if (!(await validateDnsResolution(normalized))) {
    return false;
  }

  // Basic path check: must end with .git
  if (!u.pathname.endsWith('.git')) {
    return false;
  }

  return true;
}

/**
 * Assert that a Git repository URL is safe
 *
 * Throws an error if the URL fails security validation.
 * Use this in route handlers to validate user input.
 *
 * @param value - The repository URL to validate
 * @throws Error if URL is invalid or potentially unsafe
 */
export async function assertSafeGitUrl(value: string): Promise<void> {
  const ok = await isSafeGitUrl(value);
  if (!ok) {
    throw new Error('Invalid or potentially unsafe repository URL');
  }
}

/**
 * Validate URL with DNS rebinding protection
 *
 * Performs double-validation with a small delay to detect DNS rebinding attacks.
 * Use this before actually cloning/accessing the repository.
 *
 * @param url - The repository URL to validate
 * @throws Error if URL becomes unsafe between checks
 */
export async function validateBeforeUse(url: string): Promise<void> {
  await assertSafeGitUrl(url);

  // Re-validate after a short delay to detect DNS changes
  await new Promise((resolve) => setTimeout(resolve, 100));

  await assertSafeGitUrl(url);
}
