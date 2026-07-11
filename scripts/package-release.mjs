import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import {
  chmod,
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
const packageJson = JSON.parse(
  await readFile(path.join(root, 'package.json'), 'utf8')
);
const expectedPackageManager = packageJson.packageManager;

await execute(process.execPath, ['scripts/verify-lockfile-portability.mjs'], { cwd: root });

if (Number(process.versions.node.split('.')[0]) !== 24) {
  throw new Error(
    `Production releases must be built with Node 24.x; found ${process.version}`
  );
}

const npmVersion = (
  await execute('npm', ['--version'], { cwd: root })
).stdout.trim();
if (`npm@${npmVersion}` !== expectedPackageManager) {
  throw new Error(
    `Production releases require ${expectedPackageManager}; found npm@${npmVersion}`
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
  'scripts/lib',
  'scripts/audit-dependencies.mjs',
  'scripts/evaluate-production-audit.mjs',
  'scripts/production-audit.mjs',
  'scripts/production-deploy.mjs',
  'scripts/production-doctor.mjs',
  'scripts/run-db-verify.mjs',
  'scripts/smoke-production.mjs',
  'scripts/validate-production-env.mjs',
  'scripts/verify-installed-release.mjs',
  'scripts/verify-postgres.mjs',
  'scripts/verify-production-release.mjs',
  'scripts/verify-toolchain.mjs',
  'scripts/write-dependency-inventory.mjs',
  'scripts/verify-lockfile-portability.mjs'
];

for (const source of sources) {
  const absolute = path.join(root, source);
  await stat(absolute);
  await cp(absolute, path.join(staging, source), { recursive: true });
}

await execute(
  process.execPath,
  ['scripts/write-dependency-inventory.mjs', path.join(staging, 'DEPENDENCY-INVENTORY.json')],
  { cwd: root }
);
await execute(
  process.execPath,
  ['scripts/audit-dependencies.mjs', '--output', path.join(staging, 'SECURITY-AUDIT.json'), '--json'],
  { cwd: root, maxBuffer: 32 * 1024 * 1024 }
);
await chmod(path.join(staging, 'DEPENDENCY-INVENTORY.json'), 0o644);
await chmod(path.join(staging, 'SECURITY-AUDIT.json'), 0o644);

await writeFile(
  path.join(staging, 'RELEASE.json'),
  JSON.stringify({
    schemaVersion: 2,
    commit,
    artifact: `smallverse-${shortCommit}`,
    generatedAt: new Date().toISOString(),
    node: process.version,
    packageManager: expectedPackageManager,
    releaseFormat: 'immutable-vps-release-v1',
    sourceBoundary: {
      authoritativeRoot: '/opt/smallverse',
      authoritativeDataIsReadOnly: true,
      workerEnabledByDefault: false
    },
    deploymentBoundary: {
      releaseRoot: '/srv/smallverse/releases',
      currentSymlink: '/srv/smallverse/current',
      environmentRoot: '/etc/smallverse',
      publicApi: '127.0.0.1:8780',
      operatorApi: 'tailscale-or-loopback:8781',
      shadowNginx: '127.0.0.1:8088'
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
  packageManager: expectedPackageManager,
  fileCount: files.length + 1
}, null, 2));
