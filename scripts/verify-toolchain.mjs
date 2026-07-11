#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import process from 'node:process';

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return String(result.stdout).trim();
}

async function main() {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
  const manager = String(packageJson.packageManager ?? '');
  const match = manager.match(/^npm@(\d+)\.(\d+)\.(\d+)$/);

  if (!match) {
    throw new Error('package.json must pin an exact npm version in packageManager');
  }

  const expectedNpm = match.slice(1).join('.');
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  const actualNpm = run('npm', ['--version']);

  if (nodeMajor !== 24) {
    throw new Error(`Node 24.x is required; found ${process.version}`);
  }
  if (actualNpm !== expectedNpm) {
    throw new Error(
      `npm ${expectedNpm} is required; found ${actualNpm}. ` +
      `Use Corepack or install the pinned npm version before certifying a release.`
    );
  }
  if (packageJson.engines?.node !== '24.x') {
    throw new Error('package.json engines.node must equal 24.x');
  }
  if (packageJson.engines?.npm !== '11.x') {
    throw new Error('package.json engines.npm must equal 11.x');
  }

  console.log(JSON.stringify({
    ok: true,
    node: process.version,
    npm: actualNpm,
    packageManager: manager
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
