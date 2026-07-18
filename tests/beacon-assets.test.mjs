import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bestItemIconPath,
  smallverseIconUrl
} from '../src/lib/beacon/assets.js';

test('bestItemIconPath prefers rendered variants over catalog icons', () => {
  assert.equal(
    bestItemIconPath({
      icon: 'items/base/chair.png',
      variant_icon: '/observatory-variant-icons/chair-red.png'
    }),
    '/observatory-variant-icons/chair-red.png'
  );
});

test('bestItemIconPath supports the rendered_icon compatibility field', () => {
  assert.equal(
    bestItemIconPath({
      icon: 'items/base/chair.png',
      rendered_icon: '/rendered/chair.png'
    }),
    '/rendered/chair.png'
  );
});

test('smallverseIconUrl preserves same-origin rendered icon paths', () => {
  assert.equal(
    smallverseIconUrl('/observatory-variant-icons/chair-red.png'),
    '/observatory-variant-icons/chair-red.png'
  );
});

test('smallverseIconUrl maps catalog icon paths to the asset CDN', () => {
  assert.equal(
    smallverseIconUrl('items/base/chair.png'),
    'https://content.smallverse.app/assets/items/base/chair.png'
  );
});
