import { describe, it, expect, vi, beforeEach } from 'vitest';
import dns from 'dns';
import {
  isSafeGitUrl,
  assertSafeGitUrl,
  validateBeforeUse,
} from '../../../src/utils/urlSecurity';

// Mock DNS module
vi.mock('dns', () => ({
  default: {
    promises: {
      lookup: vi.fn(),
    },
  },
}));

const mockDnsLookup = dns.promises.lookup as ReturnType<typeof vi.fn>;

describe('URL Security - SSRF Protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment variables
    delete process.env.ALLOWED_GIT_HOSTS;
    delete process.env.ALLOW_HTTP_GIT;
  });

  describe('isSafeGitUrl', () => {
    describe('Valid URLs', () => {
      it('should accept valid GitHub HTTPS URL', async () => {
        mockDnsLookup.mockResolvedValueOnce([
          { address: '140.82.121.4', family: 4 },
        ]);

        const result = await isSafeGitUrl('https://github.com/user/repo.git');
        expect(result).toBe(true);
      });

      it('should accept valid GitLab HTTPS URL', async () => {
        mockDnsLookup.mockResolvedValueOnce([
          { address: '172.65.251.78', family: 4 },
        ]);

        const result = await isSafeGitUrl('https://gitlab.com/user/repo.git');
        expect(result).toBe(true);
      });

      it('should accept valid Bitbucket HTTPS URL', async () => {
        mockDnsLookup.mockResolvedValueOnce([
          { address: '104.192.141.1', family: 4 },
        ]);

        const result = await isSafeGitUrl(
          'https://bitbucket.org/user/repo.git'
        );
        expect(result).toBe(true);
      });

      it('should accept HTTP when ALLOW_HTTP_GIT is true', async () => {
        process.env.ALLOW_HTTP_GIT = 'true';
        mockDnsLookup.mockResolvedValueOnce([
          { address: '140.82.121.4', family: 4 },
        ]);

        const result = await isSafeGitUrl('http://github.com/user/repo.git');
        expect(result).toBe(true);
      });
    });

    describe('Protocol Validation', () => {
      it('should reject HTTP URLs by default', async () => {
        const result = await isSafeGitUrl('http://github.com/user/repo.git');
        expect(result).toBe(false);
      });

      it('should reject git:// protocol', async () => {
        const result = await isSafeGitUrl('git://github.com/user/repo.git');
        expect(result).toBe(false);
      });

      it('should reject ssh:// protocol', async () => {
        const result = await isSafeGitUrl('ssh://git@github.com/user/repo.git');
        expect(result).toBe(false);
      });

      it('should reject file:// protocol', async () => {
        const result = await isSafeGitUrl('file:///tmp/repo.git');
        expect(result).toBe(false);
      });
    });

    describe('Hostname Allowlist', () => {
      it('should reject non-allowlisted hostname', async () => {
        const result = await isSafeGitUrl('https://evil.com/user/repo.git');
        expect(result).toBe(false);
      });

      it('should accept custom allowed hosts from env', async () => {
        process.env.ALLOWED_GIT_HOSTS = 'custom.git.com,another.git.org';
        mockDnsLookup.mockResolvedValueOnce([
          { address: '1.2.3.4', family: 4 },
        ]);

        const result = await isSafeGitUrl('https://custom.git.com/repo.git');
        expect(result).toBe(true);
      });

      it('should normalize hostname with trailing dots', async () => {
        mockDnsLookup.mockResolvedValueOnce([
          { address: '140.82.121.4', family: 4 },
        ]);

        const result = await isSafeGitUrl('https://github.com./user/repo.git');
        expect(result).toBe(true);
      });

      it('should be case-insensitive for hostnames', async () => {
        mockDnsLookup.mockResolvedValueOnce([
          { address: '140.82.121.4', family: 4 },
        ]);

        const result = await isSafeGitUrl('https://GitHub.COM/user/repo.git');
        expect(result).toBe(true);
      });
    });

    describe('SSRF Protection - IPv4', () => {
      it('should reject loopback 127.0.0.1', async () => {
        mockDnsLookup.mockResolvedValueOnce([
          { address: '127.0.0.1', family: 4 },
        ]);

        const result = await isSafeGitUrl('https://github.com/user/repo.git');
        expect(result).toBe(false);
      });

      it('should reject loopback 127.x.x.x', async () => {
        mockDnsLookup.mockResolvedValueOnce([
          { address: '127.1.2.3', family: 4 },
        ]);

        const result = await isSafeGitUrl('https://github.com/user/repo.git');
        expect(result).toBe(false);
      });

      it('should reject private network 10.x.x.x', async () => {
        mockDnsLookup.mockResolvedValueOnce([
          { address: '10.0.0.1', family: 4 },
        ]);

        const result = await isSafeGitUrl('https://github.com/user/repo.git');
        expect(result).toBe(false);
      });

      it('should reject private network 192.168.x.x', async () => {
        mockDnsLookup.mockResolvedValueOnce([
          { address: '192.168.1.1', family: 4 },
        ]);

        const result = await isSafeGitUrl('https://github.com/user/repo.git');
        expect(result).toBe(false);
      });

      it('should reject private network 172.16-31.x.x', async () => {
        mockDnsLookup.mockResolvedValueOnce([
          { address: '172.16.0.1', family: 4 },
        ]);

        const result = await isSafeGitUrl('https://github.com/user/repo.git');
        expect(result).toBe(false);

        mockDnsLookup.mockResolvedValueOnce([
          { address: '172.31.255.255', family: 4 },
        ]);

        const result2 = await isSafeGitUrl('https://github.com/user/repo.git');
        expect(result2).toBe(false);
      });

      it('should accept 172.15.x.x (not in private range)', async () => {
        mockDnsLookup.mockResolvedValueOnce([
          { address: '172.15.0.1', family: 4 },
        ]);

        const result = await isSafeGitUrl('https://github.com/user/repo.git');
        expect(result).toBe(true);
      });

      it('should accept 172.32.x.x (not in private range)', async () => {
        mockDnsLookup.mockResolvedValueOnce([
          { address: '172.32.0.1', family: 4 },
        ]);

        const result = await isSafeGitUrl('https://github.com/user/repo.git');
        expect(result).toBe(true);
      });

      it('should reject link-local 169.254.x.x', async () => {
        mockDnsLookup.mockResolvedValueOnce([
          { address: '169.254.0.1', family: 4 },
        ]);

        const result = await isSafeGitUrl('https://github.com/user/repo.git');
        expect(result).toBe(false);
      });

      it('should reject 0.0.0.0 network', async () => {
        mockDnsLookup.mockResolvedValueOnce([
          { address: '0.0.0.0', family: 4 },
        ]);

        const result = await isSafeGitUrl('https://github.com/user/repo.git');
        expect(result).toBe(false);
      });

      it('should reject broadcast 255.255.255.255', async () => {
        mockDnsLookup.mockResolvedValueOnce([
          { address: '255.255.255.255', family: 4 },
        ]);

        const result = await isSafeGitUrl('https://github.com/user/repo.git');
        expect(result).toBe(false);
      });

      it('should reject multicast 224.0.0.0/4', async () => {
        mockDnsLookup.mockResolvedValueOnce([
          { address: '224.0.0.1', family: 4 },
        ]);

        const result = await isSafeGitUrl('https://github.com/user/repo.git');
        expect(result).toBe(false);
      });

      it('should reject reserved 240.0.0.0/4', async () => {
        mockDnsLookup.mockResolvedValueOnce([
          { address: '240.0.0.1', family: 4 },
        ]);

        const result = await isSafeGitUrl('https://github.com/user/repo.git');
        expect(result).toBe(false);
      });
    });

    describe('SSRF Protection - IPv6', () => {
      it('should reject IPv6 loopback ::1', async () => {
        mockDnsLookup.mockResolvedValueOnce([{ address: '::1', family: 6 }]);

        const result = await isSafeGitUrl('https://github.com/user/repo.git');
        expect(result).toBe(false);
      });

      it('should reject IPv6 unspecified ::', async () => {
        mockDnsLookup.mockResolvedValueOnce([{ address: '::', family: 6 }]);

        const result = await isSafeGitUrl('https://github.com/user/repo.git');
        expect(result).toBe(false);
      });

      it('should reject IPv6 link-local fe80::/10', async () => {
        mockDnsLookup.mockResolvedValueOnce([
          { address: 'fe80::1', family: 6 },
        ]);

        const result = await isSafeGitUrl('https://github.com/user/repo.git');
        expect(result).toBe(false);
      });

      it('should reject IPv6 unique local fc00::/7', async () => {
        mockDnsLookup.mockResolvedValueOnce([
          { address: 'fc00::1', family: 6 },
        ]);

        const result = await isSafeGitUrl('https://github.com/user/repo.git');
        expect(result).toBe(false);

        mockDnsLookup.mockResolvedValueOnce([
          { address: 'fd00::1', family: 6 },
        ]);

        const result2 = await isSafeGitUrl('https://github.com/user/repo.git');
        expect(result2).toBe(false);
      });

      it('should reject IPv4-mapped IPv6 ::ffff:127.0.0.1', async () => {
        mockDnsLookup.mockResolvedValueOnce([
          { address: '::ffff:127.0.0.1', family: 6 },
        ]);

        const result = await isSafeGitUrl('https://github.com/user/repo.git');
        expect(result).toBe(false);
      });

      it('should reject IPv4-mapped IPv6 ::ffff:192.168.1.1', async () => {
        mockDnsLookup.mockResolvedValueOnce([
          { address: '::ffff:192.168.1.1', family: 6 },
        ]);

        const result = await isSafeGitUrl('https://github.com/user/repo.git');
        expect(result).toBe(false);
      });

      it('should reject IPv6 multicast ff00::/8', async () => {
        mockDnsLookup.mockResolvedValueOnce([
          { address: 'ff02::1', family: 6 },
        ]);

        const result = await isSafeGitUrl('https://github.com/user/repo.git');
        expect(result).toBe(false);
      });

      it('should accept valid public IPv6', async () => {
        mockDnsLookup.mockResolvedValueOnce([
          { address: '2606:50c0:8000::153', family: 6 },
        ]);

        const result = await isSafeGitUrl('https://github.com/user/repo.git');
        expect(result).toBe(true);
      });
    });

    describe('Additional Security Checks', () => {
      it('should reject URLs with userinfo', async () => {
        const result = await isSafeGitUrl(
          'https://user:pass@github.com/repo.git'
        );
        expect(result).toBe(false);
      });

      it('should reject URLs without .git extension', async () => {
        mockDnsLookup.mockResolvedValueOnce([
          { address: '140.82.121.4', family: 4 },
        ]);

        const result = await isSafeGitUrl('https://github.com/user/repo');
        expect(result).toBe(false);
      });

      it('should reject malformed URLs', async () => {
        const result = await isSafeGitUrl('not-a-url');
        expect(result).toBe(false);
      });

      it('should reject when DNS lookup fails', async () => {
        mockDnsLookup.mockRejectedValueOnce(new Error('DNS lookup failed'));

        const result = await isSafeGitUrl('https://github.com/user/repo.git');
        expect(result).toBe(false);
      });

      it('should reject when DNS returns no addresses', async () => {
        mockDnsLookup.mockResolvedValueOnce([]);

        const result = await isSafeGitUrl('https://github.com/user/repo.git');
        expect(result).toBe(false);
      });
    });
  });

  describe('assertSafeGitUrl', () => {
    it('should not throw for valid URL', async () => {
      mockDnsLookup.mockResolvedValueOnce([
        { address: '140.82.121.4', family: 4 },
      ]);

      await expect(
        assertSafeGitUrl('https://github.com/user/repo.git')
      ).resolves.toBeUndefined();
    });

    it('should throw for invalid URL', async () => {
      await expect(
        assertSafeGitUrl('https://evil.com/repo.git')
      ).rejects.toThrow('Invalid or potentially unsafe repository URL');
    });

    it('should throw for SSRF attempt', async () => {
      mockDnsLookup.mockResolvedValueOnce([
        { address: '127.0.0.1', family: 4 },
      ]);

      await expect(
        assertSafeGitUrl('https://github.com/user/repo.git')
      ).rejects.toThrow('Invalid or potentially unsafe repository URL');
    });
  });

  describe('validateBeforeUse - DNS Rebinding Protection', () => {
    it('should pass when URL remains safe after delay', async () => {
      // First validation
      mockDnsLookup.mockResolvedValueOnce([
        { address: '140.82.121.4', family: 4 },
      ]);
      // Second validation after delay
      mockDnsLookup.mockResolvedValueOnce([
        { address: '140.82.121.4', family: 4 },
      ]);

      await expect(
        validateBeforeUse('https://github.com/user/repo.git')
      ).resolves.toBeUndefined();

      expect(mockDnsLookup).toHaveBeenCalledTimes(2);
    });

    it('should detect DNS rebinding attack', async () => {
      // First validation - returns public IP
      mockDnsLookup.mockResolvedValueOnce([
        { address: '140.82.121.4', family: 4 },
      ]);
      // Second validation - returns private IP (rebinding attack)
      mockDnsLookup.mockResolvedValueOnce([
        { address: '127.0.0.1', family: 4 },
      ]);

      await expect(
        validateBeforeUse('https://github.com/user/repo.git')
      ).rejects.toThrow('Invalid or potentially unsafe repository URL');

      expect(mockDnsLookup).toHaveBeenCalledTimes(2);
    });
  });
});
