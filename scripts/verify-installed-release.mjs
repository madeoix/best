#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

async function main() {
  const root = path.resolve(process.argv[2] || process.cwd());
  const release = JSON.parse(await readFile(path.join(root, 'RELEASE.json'), 'utf8'));
  const required = [
    'apps/api/dist/entrypoints/public.js',
    'apps/api/dist/entrypoints/operator.js',
    'apps/api/dist/entrypoints/worker.js',
    'node_modules/fastify/package.json',
    'node_modules/@smallverse/contracts/package.json',
    'node_modules/@smallverse/database/package.json'
  ];

  for (const filename of required) {
    await access(path.join(root, filename));
  }

  const lockfileCheck = spawnSync(process.execPath, [
    path.join(root, 'scripts/verify-lockfile-portability.mjs'),
    '--lockfile',
    path.join(root, 'package-lock.json')
  ], {
    cwd: root,
    encoding: 'utf8'
  });
  if (lockfileCheck.error) throw lockfileCheck.error;
  if (lockfileCheck.status !== 0) {
    throw new Error(
      `Installed release lockfile is not portable:\n${lockfileCheck.stdout}\n${lockfileCheck.stderr}`
    );
  }

  const npmCommand = process.env.SMALLVERSE_NPM_BIN?.trim() || 'npm';
  const result = spawnSync(npmCommand, ['ls', '--omit=dev', '--all', '--json'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, NODE_ENV: 'production' }
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Production dependency tree is invalid:\n${result.stdout}\n${result.stderr}`);
  }

  console.log(JSON.stringify({
    ok: true,
    root,
    commit: release.commit,
    node: process.version,
    productionDependencies: 'valid'
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
