#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

function run(command, args, options = {}) {
  const startedAt = Date.now();
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    timeout: options.timeout ?? 20 * 60_000,
    maxBuffer: 64 * 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with status ${result.status}`);
  }
  return {
    durationMs: Date.now() - startedAt,
    stdout: String(result.stdout ?? '').trim()
  };
}

async function main() {
  run(process.execPath, ['scripts/verify-toolchain.mjs']);
  const commit = run('git', ['rev-parse', 'HEAD'], { capture: true }).stdout;
  const status = run('git', [
    'status', '--porcelain', '--untracked-files=normal'
  ], { capture: true }).stdout;
  if (status) throw new Error('Release lifecycle requires a clean Git worktree');

  const temporary = await mkdtemp(path.join(os.tmpdir(), 'smallverse-lifecycle-'));
  const sourceArchive = path.join(temporary, 'source.tar.gz');
  const source = path.join(temporary, 'source');
  const releaseRoot = path.join(temporary, 'releases');
  const stages = [];

  try {
    run('git', [
      'archive', '--format=tar.gz', `--output=${sourceArchive}`, 'HEAD'
    ]);
    run('mkdir', ['-p', source]);
    run('tar', ['-xzf', sourceArchive, '-C', source]);

    const lockfileResult = run(
      process.execPath,
      ['scripts/verify-lockfile-portability.mjs'],
      { cwd: source }
    );
    stages.push({
      name: 'lockfile portability',
      durationMs: lockfileResult.durationMs
    });

    for (const [name, command, args, timeout] of [
      ['clean install', 'npm', ['ci'], 20 * 60_000],
      ['tests', 'npm', ['test'], 20 * 60_000],
      ['build', 'npm', ['run', 'build:all'], 20 * 60_000],
      ['dependency audit', 'npm', ['run', 'dependency:audit'], 5 * 60_000]
    ]) {
      const result = run(command, args, { cwd: source, timeout });
      stages.push({ name, durationMs: result.durationMs });
    }

    const packaged = run(process.execPath, [
      'scripts/package-release.mjs'
    ], {
      cwd: source,
      env: {
        ...process.env,
        SMALLVERSE_RELEASE_COMMIT: commit,
        SMALLVERSE_RELEASE_ROOT: releaseRoot
      },
      capture: true,
      timeout: 10 * 60_000
    });
    stages.push({ name: 'package', durationMs: packaged.durationMs });
    const packageResult = JSON.parse(packaged.stdout);

    run(process.execPath, [
      'scripts/verify-production-release.mjs', packageResult.archive
    ], { cwd: source });

    const installRoot = path.join(temporary, 'installed');
    run('mkdir', ['-p', installRoot]);
    run('tar', ['-xzf', packageResult.archive, '-C', installRoot]);
    const entries = await readdir(installRoot, { withFileTypes: true });
    const roots = entries.filter((entry) => entry.isDirectory());
    if (entries.length !== 1 || roots.length !== 1) {
      throw new Error('Packaged release did not contain one top-level directory');
    }
    const installed = path.join(installRoot, roots[0].name);
    const installResult = run('npm', [
      'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'
    ], {
      cwd: installed,
      env: { ...process.env, NODE_ENV: 'production' },
      timeout: 10 * 60_000
    });
    stages.push({ name: 'production install', durationMs: installResult.durationMs });
    run(process.execPath, [
      'scripts/verify-installed-release.mjs', installed
    ], { cwd: installed });

    const release = JSON.parse(
      await readFile(path.join(installed, 'RELEASE.json'), 'utf8')
    );
    const certifiedRoot = path.resolve(
      process.env.SMALLVERSE_CERTIFIED_RELEASE_ROOT?.trim() ||
      path.join(process.cwd(), 'releases')
    );
    await mkdir(certifiedRoot, { recursive: true });
    const certifiedArchive = path.join(
      certifiedRoot,
      path.basename(packageResult.archive)
    );
    const certifiedChecksum = `${certifiedArchive}.sha256`;
    await copyFile(packageResult.archive, certifiedArchive);
    await copyFile(`${packageResult.archive}.sha256`, certifiedChecksum);
    run('sha256sum', ['-c', path.basename(certifiedChecksum)], {
      cwd: certifiedRoot
    });

    console.log(JSON.stringify({
      ok: true,
      commit,
      releaseCommit: release.commit,
      archive: certifiedArchive,
      checksum: certifiedChecksum,
      sha256: packageResult.sha256,
      stages
    }, null, 2));
  } finally {
    if (process.env.SMALLVERSE_KEEP_LIFECYCLE_TEMP !== '1') {
      await rm(temporary, { recursive: true, force: true });
    } else {
      console.error(`Lifecycle temporary directory retained: ${temporary}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
