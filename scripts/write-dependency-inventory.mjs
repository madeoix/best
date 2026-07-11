#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

function usage() {
  console.log('Usage: node scripts/write-dependency-inventory.mjs <output.json>');
}

function packageNameFromPath(packagePath, entry) {
  if (entry.name) return entry.name;
  const marker = 'node_modules/';
  const index = packagePath.lastIndexOf(marker);
  if (index === -1) return null;
  return packagePath.slice(index + marker.length);
}

async function main() {
  const output = process.argv[2];
  if (!output || output === '--help') {
    usage();
    process.exit(output ? 0 : 1);
  }

  const lockText = await readFile('package-lock.json', 'utf8');
  const lock = JSON.parse(lockText);
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
  const packages = [];

  for (const [packagePath, entry] of Object.entries(lock.packages ?? {})) {
    if (!packagePath || !packagePath.includes('node_modules/')) continue;
    const name = packageNameFromPath(packagePath, entry);
    if (!name || !entry.version) continue;

    packages.push({
      name,
      version: entry.version,
      scope: entry.dev === true ? 'development' : 'production',
      optional: entry.optional === true,
      integrity: entry.integrity ?? null
    });
  }

  packages.sort((left, right) =>
    left.scope.localeCompare(right.scope) ||
    left.name.localeCompare(right.name) ||
    left.version.localeCompare(right.version)
  );

  const production = packages.filter((item) => item.scope === 'production');
  const development = packages.filter((item) => item.scope === 'development');
  const inventory = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    packageManager: packageJson.packageManager ?? null,
    lockfileVersion: lock.lockfileVersion,
    lockfileSha256: createHash('sha256').update(lockText).digest('hex'),
    counts: {
      total: packages.length,
      production: production.length,
      development: development.length,
      optional: packages.filter((item) => item.optional).length
    },
    packages
  };

  await writeFile(path.resolve(output), `${JSON.stringify(inventory, null, 2)}\n`);
  console.log(JSON.stringify({
    output: path.resolve(output),
    ...inventory.counts,
    lockfileSha256: inventory.lockfileSha256
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
