import { describe, expect, it } from 'vitest';
import {
  loadOperatorConfig,
  loadPublicConfig
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
});
