import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  lstat,
  mkdtemp,
  readFile,
  readdir,
  rm
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export function runCommand(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
    timeout: options.timeout ?? 120_000,
    maxBuffer: options.maxBuffer ?? 32 * 1024 * 1024,
    stdio: options.stdio ?? 'pipe'
  });

  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(
      `${command} ${args.join(' ')} failed with status ${result.status}:\n` +
      `${result.stdout ?? ''}${result.stderr ?? ''}`
    );
  }

  return {
    status: result.status,
    stdout: String(result.stdout ?? ''),
    stderr: String(result.stderr ?? '')
  };
}

export function safeArchiveEntry(entry) {
  if (!entry || entry.startsWith('/') || entry.includes('\\')) return false;
  const parts = entry.split('/').filter(Boolean);
  return !parts.includes('..');
}

export async function sha256(filename) {
  return createHash('sha256')
    .update(await readFile(filename))
    .digest('hex');
}

export async function verifyOuterChecksum(archive, sidecar = `${archive}.sha256`) {
  let text;
  try {
    text = await readFile(sidecar, 'utf8');
  } catch (error) {
    throw new Error(
      `Release checksum sidecar is missing or unreadable: ${sidecar}: ` +
      `${error instanceof Error ? error.message : String(error)}`
    );
  }

  const line = text.trim();
  const match = line.match(/^([a-f0-9]{64})\s+\*?(.+)$/);
  if (!match) throw new Error(`Invalid checksum sidecar format: ${sidecar}`);

  const expectedName = path.basename(archive);
  if (path.basename(match[2]) !== expectedName) {
    throw new Error(
      `Checksum sidecar names ${match[2]}, expected ${expectedName}`
    );
  }

  const actual = await sha256(archive);
  if (actual !== match[1]) {
    throw new Error(`Release archive checksum mismatch: ${archive}`);
  }

  return actual;
}

export async function verifyRelease(input, verifier = 'scripts/verify-production-release.mjs') {
  const result = runCommand(process.execPath, [verifier, input]);
  const output = result.stdout.trim();
  try {
    return JSON.parse(output);
  } catch {
    return { ok: true, output };
  }
}

export async function extractVerifiedRelease(archive, verifier) {
  await verifyRelease(archive, verifier);
  const listing = runCommand('tar', ['-tzf', archive]).stdout
    .split('\n')
    .filter(Boolean);

  for (const entry of listing) {
    if (!safeArchiveEntry(entry)) {
      throw new Error(`Unsafe archive entry: ${entry}`);
    }
  }

  const temporary = await mkdtemp(path.join(os.tmpdir(), 'smallverse-release-read-'));
  try {
    runCommand('tar', [
      '-xzf',
      archive,
      '-C',
      temporary,
      '--no-same-owner',
      '--no-same-permissions'
    ]);
    const entries = await readdir(temporary, { withFileTypes: true });
    const directories = entries.filter((entry) => entry.isDirectory());
    if (entries.length !== 1 || directories.length !== 1) {
      throw new Error('Release archive must contain exactly one top-level directory');
    }

    const root = path.join(temporary, directories[0].name);
    const release = JSON.parse(await readFile(path.join(root, 'RELEASE.json'), 'utf8'));
    return { temporary, root, release, cleanup: async () => rm(temporary, { recursive: true, force: true }) };
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

export async function readInstalledRelease(directory) {
  const info = await lstat(directory);
  if (!info.isDirectory()) throw new Error(`Not a release directory: ${directory}`);
  const release = JSON.parse(await readFile(path.join(directory, 'RELEASE.json'), 'utf8'));
  return release;
}
