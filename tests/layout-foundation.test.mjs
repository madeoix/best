import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { compile } from 'svelte/compiler';

const componentNames = [
  'AppShell',
  'DataList',
  'EntityHero',
  'PageHeader',
  'SectionCard',
  'StatusBadge'
];

test('Beacon layout primitives compile without Svelte warnings', async () => {
  for (const componentName of componentNames) {
    const filename = new URL(
      `../src/lib/components/layout/${componentName}.svelte`,
      import.meta.url
    );
    const source = await readFile(filename, 'utf8');
    const result = compile(source, {
      filename: filename.pathname,
      generate: 'client'
    });

    assert.deepEqual(
      result.warnings,
      [],
      `${componentName}.svelte should compile without accessibility or compiler warnings`
    );
  }
});

test('Beacon foundation is namespaced and defines both shell layouts', async () => {
  const stylesheet = await readFile(
    new URL('../src/lib/styles/beacon-foundation.css', import.meta.url),
    'utf8'
  );

  assert.match(stylesheet, /--beacon-canvas:/);
  assert.match(stylesheet, /--beacon-accent:/);
  assert.match(stylesheet, /--beacon-space-6:/);
  assert.match(stylesheet, /\.beacon-foundation/);
  assert.match(stylesheet, /\.bui-shell--public/);
  assert.match(stylesheet, /\.bui-shell--operations/);
  assert.match(stylesheet, /\.bui-profile-grid/);
  assert.doesNotMatch(stylesheet, /(^|\n)\s*(html|body|\*)\s*\{/);
});

test('layout barrel exposes the complete primitive set', async () => {
  const barrel = await readFile(
    new URL('../src/lib/components/layout/index.js', import.meta.url),
    'utf8'
  );

  for (const componentName of componentNames) {
    assert.match(
      barrel,
      new RegExp(`default as ${componentName}`),
      `${componentName} should be exported from the layout barrel`
    );
  }
});
