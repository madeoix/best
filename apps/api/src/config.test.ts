import { describe, expect, it } from 'vitest';
import {
  loadOperatorConfig,
  loadPublicConfig,
  loadWorkerConfig
} from './config.js';

describe('runtime configuration boundaries', () => {
  it('uses the public-specific CORS origin list', () => {
    const config = loadPublicConfig({
      SMALLVERSE_ALLOWED_ORIGINS: 'https://legacy.example',
      SMALLVERSE_PUBLIC_ALLOWED_ORIGINS:
        'https://smallverse.example,https://museum.example'
    });

    expect(config.allowedOrigins).toEqual([
      'https://smallverse.example',
      'https://museum.example'
    ]);
  });

  it('keeps the production public API loopback-only', () => {
    expect(() => loadPublicConfig({
      NODE_ENV: 'production',
      SMALLVERSE_PUBLIC_HOST: '0.0.0.0'
    })).toThrow(/loopback-only/);

    expect(loadPublicConfig({
      NODE_ENV: 'production',
      SMALLVERSE_PUBLIC_HOST: '127.0.0.1'
    }).host).toBe('127.0.0.1');
  });

  it('does not inherit public browser origins into the operator API', () => {
    const config = loadOperatorConfig({
      NODE_ENV: 'development',
      SMALLVERSE_ALLOWED_ORIGINS: 'http://127.0.0.1:5173',
      SMALLVERSE_PUBLIC_ALLOWED_ORIGINS:
        'http://127.0.0.1:5173',
      SMALLVERSE_OPERATOR_TOKEN:
        'test-operator-token-that-is-long-enough'
    });

    expect(config.allowedOrigins).toEqual([]);
  });

  it('accepts an operator origin only when explicitly configured', () => {
    const config = loadOperatorConfig({
      NODE_ENV: 'development',
      SMALLVERSE_OPERATOR_ALLOWED_ORIGINS:
        'https://operator.smallverse.example',
      SMALLVERSE_OPERATOR_TOKEN:
        'test-operator-token-that-is-long-enough'
    });

    expect(config.allowedOrigins).toEqual([
      'https://operator.smallverse.example'
    ]);
  });

  it('rejects a production operator wildcard bind', () => {
    expect(() => loadOperatorConfig({
      NODE_ENV: 'production',
      SMALLVERSE_OPERATOR_HOST: '0.0.0.0',
      SMALLVERSE_OPERATOR_TOKEN:
        'test-operator-token-that-is-long-enough'
    })).toThrow(/wildcard/);
  });

  it('keeps the production worker disabled unless explicitly armed', () => {
    expect(loadWorkerConfig({
      NODE_ENV: 'production'
    }).enabled).toBe(false);

    expect(loadWorkerConfig({
      NODE_ENV: 'production',
      SMALLVERSE_WORKER_ENABLED: 'true'
    }).enabled).toBe(true);
  });
});
