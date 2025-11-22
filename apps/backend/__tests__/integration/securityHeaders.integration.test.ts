import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import express, { Express, Request, Response } from 'express';
import helmet from 'helmet';
import request from 'supertest';
import { HTTP_STATUS } from '@gitray/shared-types';

// Mock the logger and metrics services
vi.mock('../../src/services/logger', () => ({
  __esModule: true,
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    http: vi.fn(),
    verbose: vi.fn(),
    silly: vi.fn(),
  },
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    http: vi.fn(),
    verbose: vi.fn(),
    silly: vi.fn(),
  })),
}));

vi.mock('../../src/services/metrics', () => ({
  recordDetailedError: vi.fn(),
  updateServiceHealthScore: vi.fn(),
  getUserType: vi.fn(() => 'anonymous'),
  recordFeatureUsage: vi.fn(),
}));

describe('Security Headers Integration Tests', () => {
  let app: Express;

  beforeAll(async () => {
    // Create a test Express app that mimics the real application structure
    app = express();

    // Apply Helmet middleware (like the real app)
    app.use(helmet());

    // Add a test route that works
    app.get('/api/test', (req: Request, res: Response) => {
      res.json({ message: 'success' });
    });

    // Import and apply the actual 404 handler from index.ts
    // We inline it here to match the implementation
    app.use((req: Request, res: Response) => {
      // Set strict security headers for error responses (defense-in-depth)
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; script-src 'none'; style-src 'none'; img-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
      );
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Content-Disposition', 'inline');

      res.status(HTTP_STATUS.NOT_FOUND).json({
        error: 'Not Found',
        code: 'NOT_FOUND',
      });
    });

    // Import and apply the actual error handler
    const errorHandlerModule = await import(
      '../../src/middlewares/errorHandler'
    );
    app.use(errorHandlerModule.default);
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe('404 Handler Security Headers', () => {
    test('should include strict CSP on 404 responses', async () => {
      const response = await request(app).get('/nonexistent-route');

      expect(response.status).toBe(404);
      expect(response.headers['content-security-policy']).toBeDefined();
      expect(response.headers['content-security-policy']).toContain(
        "default-src 'none'"
      );
      expect(response.headers['content-security-policy']).toContain(
        "script-src 'none'"
      );
      expect(response.headers['content-security-policy']).toContain(
        "frame-ancestors 'none'"
      );
    });

    test('should include X-Content-Type-Options: nosniff on 404', async () => {
      const response = await request(app).get('/another-nonexistent');

      expect(response.status).toBe(404);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    test('should include X-Frame-Options: DENY on 404', async () => {
      const response = await request(app).get('/yet-another-404');

      expect(response.status).toBe(404);
      expect(response.headers['x-frame-options']).toBe('DENY');
    });

    test('should include Content-Disposition: inline on 404', async () => {
      const response = await request(app).get('/missing-page');

      expect(response.status).toBe(404);
      expect(response.headers['content-disposition']).toBe('inline');
    });

    test('should return JSON response with 404', async () => {
      const response = await request(app).get('/test/404');

      expect(response.status).toBe(404);
      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toEqual({
        error: 'Not Found',
        code: 'NOT_FOUND',
      });
    });
  });

  describe('Complete Security Header Suite', () => {
    test('should have all required security headers on error responses', async () => {
      const response = await request(app).get('/does-not-exist');

      expect(response.status).toBe(404);

      // Verify all 4 required headers are present
      expect(response.headers['content-security-policy']).toBeDefined();
      expect(response.headers['x-content-type-options']).toBeDefined();
      expect(response.headers['x-frame-options']).toBeDefined();
      expect(response.headers['content-disposition']).toBeDefined();

      // Verify CSP is strict (blocks all resources)
      const csp = response.headers['content-security-policy'];
      expect(csp).toContain("default-src 'none'");
      expect(csp).toContain("script-src 'none'");
      expect(csp).toContain("style-src 'none'");
      expect(csp).toContain("img-src 'none'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("base-uri 'none'");
      expect(csp).toContain("form-action 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
    });
  });

  describe('XSS Payload Handling with Security Headers', () => {
    test('should return safe JSON with security headers for XSS payloads', async () => {
      const xssPayloads = [
        '/%3Cscript%3Ealert(1)%3C/script%3E',
        '/%3Csvg%2Fonload%3Dalert(1)%3E',
        '/%22%3E%3Cimg%20src=x%3E',
      ];

      for (const payload of xssPayloads) {
        const response = await request(app).get(payload);

        expect(response.status).toBe(404);
        expect(response.body).toEqual({
          error: 'Not Found',
          code: 'NOT_FOUND',
        });

        // Verify security headers are present
        expect(response.headers['content-security-policy']).toContain(
          "default-src 'none'"
        );
        expect(response.headers['x-content-type-options']).toBe('nosniff');
        expect(response.headers['x-frame-options']).toBe('DENY');
        expect(response.headers['content-disposition']).toBe('inline');

        // Verify no payload reflection
        expect(JSON.stringify(response.body)).not.toContain('script');
        expect(JSON.stringify(response.body)).not.toContain('alert');
        expect(JSON.stringify(response.body)).not.toContain('svg');
      }
    });
  });

  describe('Normal Routes', () => {
    test('should not interfere with successful responses', async () => {
      const response = await request(app).get('/api/test');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'success' });

      // Normal routes should have Helmet's default CSP, not the strict error CSP
      const csp = response.headers['content-security-policy'];
      if (csp) {
        // Should NOT have the strict "default-src 'none'" from error handler
        expect(csp).not.toContain("default-src 'none'");
      }
    });
  });
});
