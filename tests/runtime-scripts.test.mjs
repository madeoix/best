import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function commandSucceeds(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8'
  });

  assert.equal(
    result.status,
    0,
    [
      `${command} ${args.join(' ')} failed`,
      result.stdout,
      result.stderr
    ].join('\n')
  );
}

test('runtime JavaScript entry scripts parse', () => {
  for (const script of [
    'scripts/dev-runtime.mjs',
    'scripts/dev-infra.mjs',
    'scripts/run-db-verify.mjs',
    'scripts/smoke-runtime.mjs',
    'scripts/verify-postgres.mjs'
  ]) {
    commandSucceeds(process.execPath, ['--check', script]);
  }
});

test('preservation export sync shell script parses', () => {
  commandSucceeds('bash', [
    '-n',
    'scripts/sync-preserved-exports.sh'
  ]);
});

test('sync script prefers the published lite Observatory read model', () => {
  const source = readFileSync(
    'scripts/sync-preserved-exports.sh',
    'utf8'
  );

  assert.match(
    source,
    /\/var\/www\/smallverse\/observatory-sync-lite\.json/
  );
  assert.match(source, /test -s/);
  assert.match(source, /trap cleanup_active EXIT/);
  assert.match(source, /if ! scp/);
});
