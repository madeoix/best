import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile
} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const root = process.cwd();

if (Number(process.versions.node.split('.')[0]) !== 24) {
  throw new Error(
    `Production releases must be built with Node 24.x; found ${process.version}`
  );
}

async function gitOutput(args) {
  try {
    return (
      await execute('git', args, { cwd: root })
    ).stdout.trim();
  } catch {
    return null;
  }
}

async function resolveCommit() {
  const explicit = process.env.SMALLVERSE_RELEASE_COMMIT?.trim();

  if (explicit && !/^[a-f0-9]{7,40}$/.test(explicit)) {
    throw new Error(
      'SMALLVERSE_RELEASE_COMMIT must be a 7-40 character lowercase Git SHA'
    );
  }

  const head = await gitOutput(['rev-parse', 'HEAD']);

  if (head) {
    const status = await gitOutput([
      'status',
      '--porcelain',
      '--untracked-files=normal'
    ]);

    if (status === null) {
      throw new Error('Unable to verify the Git worktree state');
    }

    if (status) {
      throw new Error(
        'Production releases require a clean Git worktree. Commit or remove ' +
        'all tracked and untracked changes before packaging.'
      );
    }

    if (explicit && !head.startsWith(explicit)) {
      throw new Error(
        `SMALLVERSE_RELEASE_COMMIT ${explicit} does not match HEAD ${head}`
      );
    }

    return head;
  }

  if (explicit) return explicit;

  throw new Error(
    'Git metadata is unavailable. Set SMALLVERSE_RELEASE_COMMIT to the ' +
    'verified source commit before packaging an exported source archive.'
  );
}

async function walk(directory, current = directory) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolute = path.join(current, entry.name);

    if (entry.isDirectory()) {
      files.push(...await walk(directory, absolute));
    } else if (entry.isFile()) {
      files.push(path.relative(directory, absolute).split(path.sep).join('/'));
    } else {
      throw new Error(
        `Release input may contain only files and directories: ${absolute}`
      );
    }
  }

  return files;
}

async function digest(filename) {
  return createHash('sha256')
    .update(await readFile(filename))
    .digest('hex');
}

const commit = await resolveCommit();
const shortCommit = commit.slice(0, 12);
const releaseRoot = path.resolve(
  process.env.SMALLVERSE_RELEASE_ROOT?.trim() || path.join(root, 'releases')
);
const staging = path.join(releaseRoot, `smallverse-${shortCommit}`);
const archive = `${staging}.tar.gz`;

await rm(staging, { recursive: true, force: true });
await rm(archive, { force: true });
await rm(`${archive}.sha256`, { force: true });
await mkdir(staging, { recursive: true });

const sources = [
  '.npmrc',
  '.nvmrc',
  'apps/api/dist',
  'apps/api/package.json',
  'packages/contracts/dist',
  'packages/contracts/package.json',
  'packages/database/dist',
  'packages/database/package.json',
  'build',
  'package.json',
  'package-lock.json',
  'infra',
  'deploy',
  'docs/operations',
  'scripts/production-audit.mjs',
  'scripts/evaluate-production-audit.mjs',
  'scripts/run-db-verify.mjs',
  'scripts/smoke-production.mjs',
  'scripts/verify-postgres.mjs',
  'scripts/verify-production-release.mjs'
];

for (const source of sources) {
  const absolute = path.join(root, source);
  await stat(absolute);
  await cp(absolute, path.join(staging, source), { recursive: true });
}

await writeFile(
  path.join(staging, 'RELEASE.json'),
  JSON.stringify({
    schemaVersion: 1,
    commit,
    generatedAt: new Date().toISOString(),
    node: process.version,
    packageManager: `npm@${process.env.npm_config_user_agent?.match(/npm\/([^\s]+)/)?.[1] ?? 'unknown'}`,
    sourceBoundary: {
      authoritativeRoot: '/opt/smallverse',
      authoritativeDataIsReadOnly: true,
      workerEnabledByDefault: false
    }
  }, null, 2) + '\n'
);

const files = (await walk(staging))
  .filter((filename) => filename !== 'MANIFEST.sha256')
  .sort();
const manifestLines = [];

for (const filename of files) {
  manifestLines.push(
    `${await digest(path.join(staging, filename))}  ${filename}`
  );
}

await writeFile(
  path.join(staging, 'MANIFEST.sha256'),
  `${manifestLines.join('\n')}\n`
);

await execute(
  process.execPath,
  ['scripts/verify-production-release.mjs', staging],
  { cwd: root }
);

await execute(
  'tar',
  ['-czf', archive, '-C', releaseRoot, path.basename(staging)]
);

await execute(
  process.execPath,
  ['scripts/verify-production-release.mjs', archive],
  { cwd: root }
);

const archiveDigest = await digest(archive);
await writeFile(
  `${archive}.sha256`,
  `${archiveDigest}  ${path.basename(archive)}\n`
);

console.log(JSON.stringify({
  commit,
  staging,
  archive,
  sha256: archiveDigest,
  fileCount: files.length + 1
}, null, 2));
