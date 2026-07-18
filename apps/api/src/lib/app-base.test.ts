import { describe, expect, it } from 'vitest';
import { createBaseApp } from './app-base.js';

describe('base API error handling', () => {
  it('preserves plugin client statuses instead of reporting HTTP 500', async () => {
    const app = createBaseApp({
      serviceName: 'test-service',
      logger: false
    });

    app.get('/limited', async () => {
      const error = new Error('Rate limit exceeded, retry later') as Error & {
        statusCode: number;
      };
      error.statusCode = 429;
      throw error;
    });

    const response = await app.inject({
      method: 'GET',
      url: '/limited'
    });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Rate limit exceeded, retry later'
      }
    });

    await app.close();
  });
});
