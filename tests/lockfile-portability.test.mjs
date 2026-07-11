import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { inspectLockfile } from '../scripts/verify-lockfile-portability.mjs';

function lockfileWith(resolved) {
  return {
    lockfileVersion: 3,
    packages: {
      '': {},
      'node_modules/example': {
        version: '1.0.0',
        resolved,
        integrity: 'sha512-example'
      }
    }
  };
}

test('tracked lockfile contains only public npm and workspace resolutions', () => {
  const lockfile = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  const result = inspectLockfile(lockfile);
  assert.equal(result.ok, true, JSON.stringify(result.findings, null, 2));
  assert.deepEqual(result.hosts, { 'registry.npmjs.org': 304 });
  assert.equal(result.workspaceResolutions, 3);
});

test('lockfile portability rejects internal, private, local, and unknown hosts', () => {
  for (const resolved of [
    'https://packages.internal.example/npm/example/-/example-1.0.0.tgz',
    'https://localhost/example.tgz',
    'https://127.0.0.1/example.tgz',
    'https://10.1.2.3/example.tgz',
    'https://192.168.1.2/example.tgz',
    'https://npm.pkg.github.com/example.tgz',
    'http://registry.npmjs.org/example/-/example-1.0.0.tgz'
  ]) {
    const result = inspectLockfile(lockfileWith(resolved));
    assert.equal(result.ok, false, resolved);
    assert.equal(result.findings.length, 1, resolved);
  }
});

test('lockfile portability accepts repository-relative workspace resolutions', () => {
  const result = inspectLockfile(lockfileWith('packages/example'));
  assert.equal(result.ok, true);
  assert.equal(result.workspaceResolutions, 1);
});

test('lockfile portability rejects unsafe workspace paths', () => {
  for (const resolved of [
    '../outside',
    'packages/../outside',
    '/absolute/path',
    'file:packages/example',
    'packages\\example'
  ]) {
    const result = inspectLockfile(lockfileWith(resolved));
    assert.equal(result.ok, false, resolved);
  }
});

test('project npm configuration pins the public registry without host rewriting', () => {
  const npmrc = readFileSync('.npmrc', 'utf8');
  assert.match(npmrc, /^registry=https:\/\/registry\.npmjs\.org\/$/m);
  assert.match(npmrc, /^replace-registry-host=never$/m);
});

test('release entrypoints run the lockfile portability gate', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.match(packageJson.scripts['release:package'], /npm run lockfile:verify/);

  const lifecycle = readFileSync('scripts/verify-release-lifecycle.mjs', 'utf8');
  assert.match(lifecycle, /verify-lockfile-portability\.mjs/);

  const packager = readFileSync('scripts/package-release.mjs', 'utf8');
  assert.match(packager, /verify-lockfile-portability\.mjs/);
});
