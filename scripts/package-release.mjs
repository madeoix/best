import {
  mkdir,
  rm,
  cp,
  writeFile
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import process from 'node:process';

const execute = promisify(execFile);
const root = process.cwd();
const commit = (
  await execute('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: root })
).stdout.trim();
const releaseRoot = path.join(root, 'releases');
const staging = path.join(releaseRoot, `smallverse-${commit}`);
const archive = `${staging}.tar.gz`;

await rm(staging, { recursive: true, force: true });
await rm(archive, { force: true });
await mkdir(staging, { recursive: true });

for (const source of [
  'apps/api/dist',
  'packages/contracts/dist',
  'packages/database/dist',
  'build',
  'package.json',
  'package-lock.json',
  'infra'
]) {
  await cp(
    path.join(root, source),
    path.join(staging, source),
    { recursive: true }
  );
}

await writeFile(
  path.join(staging, 'RELEASE.json'),
  JSON.stringify({
    commit,
    generatedAt: new Date().toISOString(),
    node: process.version
  }, null, 2) + '\n'
);

await execute(
  'tar',
  ['-czf', archive, '-C', releaseRoot, path.basename(staging)]
);

const { stdout } = await execute('sha256sum', [archive]);
const digest = stdout.split(/\s+/)[0];

await writeFile(`${archive}.sha256`, `${digest}  ${path.basename(archive)}\n`);

console.log(JSON.stringify({
  commit,
  archive,
  sha256: digest
}, null, 2));
