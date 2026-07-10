import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ApiRequestError,
  joinApiUrl
} from '../src/lib/runtime/apiClient.js';

test('joinApiUrl preserves relative same-origin paths', () => {
  assert.equal(
    joinApiUrl('', '/api/v1/health'),
    '/api/v1/health'
  );
});

test('joinApiUrl joins configured API bases without double slashes', () => {
  assert.equal(
    joinApiUrl('https://api.example.test/', '/api/v1/search'),
    'https://api.example.test/api/v1/search'
  );
});

test('joinApiUrl preserves absolute URLs', () => {
  assert.equal(
    joinApiUrl('https://ignored.example', 'https://assets.example/file'),
    'https://assets.example/file'
  );
});

test('ApiRequestError preserves structured response metadata', () => {
  const error = new ApiRequestError('broken', {
    status: 503,
    code: 'SERVICE_UNAVAILABLE',
    requestId: 'request-id',
    url: '/api/v1/search'
  });

  assert.equal(error.name, 'ApiRequestError');
  assert.equal(error.status, 503);
  assert.equal(error.code, 'SERVICE_UNAVAILABLE');
  assert.equal(error.requestId, 'request-id');
});
