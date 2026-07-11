#!/usr/bin/env node

import { isIP } from 'node:net';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const DEFAULT_LOCKFILE = 'package-lock.json';
const PUBLIC_NPM_HOST = 'registry.npmjs.org';

function usage() {
  console.log(`Usage: node scripts/verify-lockfile-portability.mjs [options]\n\n` +
    `Options:\n` +
    `  --lockfile <path>  Lockfile to inspect (default: package-lock.json).\n` +
    `  --json             Print JSON instead of the concise report.\n` +
    `  --help             Show this help.\n\n` +
    `Only HTTPS tarballs from registry.npmjs.org and relative workspace ` +
    `resolutions are allowed.`);
}

function parseArguments(argv) {
  const result = { lockfile: DEFAULT_LOCKFILE, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help') {
      usage();
      process.exit(0);
    }
    if (argument === '--json') {
      result.json = true;
      continue;
    }
    if (argument === '--lockfile') {
      const value = argv[index + 1];
      if (!value) throw new Error('--lockfile requires a path');
      result.lockfile = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return result;
}

function isPrivateIpv4(hostname) {
  if (isIP(hostname) !== 4) return false;
  const [a, b] = hostname.split('.').map(Number);
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

function isPrivateIpv6(hostname) {
  if (isIP(hostname) !== 6) return false;
  const normalized = hostname.toLowerCase();
  return (
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    /^fe[89ab]/.test(normalized)
  );
}

function classifyResolution(resolved) {
  if (typeof resolved !== 'string' || resolved.length === 0) {
    return { ok: false, code: 'LOCK_RESOLUTION_INVALID' };
  }

  // npm workspace entries are represented by repository-relative paths.
  if (!resolved.includes('://')) {
    const segments = resolved.split('/');
    if (
      path.isAbsolute(resolved) ||
      resolved.includes(':') ||
      resolved.includes('\\') ||
      segments.some((segment) => segment === '' || segment === '.' || segment === '..')
    ) {
      return { ok: false, code: 'LOCK_WORKSPACE_PATH_UNSAFE' };
    }
    return { ok: true, kind: 'workspace' };
  }

  let url;
  try {
    url = new URL(resolved);
  } catch {
    return { ok: false, code: 'LOCK_RESOLUTION_URL_INVALID' };
  }

  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== 'https:') {
    return { ok: false, code: 'LOCK_REGISTRY_PROTOCOL_UNSAFE', hostname };
  }
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    isPrivateIpv4(hostname) ||
    isPrivateIpv6(hostname)
  ) {
    return { ok: false, code: 'LOCK_REGISTRY_PRIVATE', hostname };
  }
  if (hostname !== PUBLIC_NPM_HOST) {
    return { ok: false, code: 'LOCK_REGISTRY_NOT_ALLOWED', hostname };
  }

  return { ok: true, kind: 'registry', hostname };
}

export function inspectLockfile(lockfile) {
  const findings = [];
  const hosts = new Map();
  let registryResolutions = 0;
  let workspaceResolutions = 0;

  if (lockfile.lockfileVersion !== 3) {
    findings.push({
      code: 'LOCKFILE_VERSION_UNEXPECTED',
      location: 'lockfileVersion',
      value: lockfile.lockfileVersion
    });
  }
  if (!lockfile.packages || typeof lockfile.packages !== 'object') {
    findings.push({
      code: 'LOCKFILE_PACKAGES_MISSING',
      location: 'packages'
    });
    return {
      ok: false,
      findings,
      registryResolutions,
      workspaceResolutions,
      hosts: {}
    };
  }

  for (const [location, item] of Object.entries(lockfile.packages)) {
    if (!item || typeof item !== 'object' || !('resolved' in item)) continue;
    const classified = classifyResolution(item.resolved);
    if (!classified.ok) {
      findings.push({
        code: classified.code,
        location,
        resolved: item.resolved,
        ...(classified.hostname ? { hostname: classified.hostname } : {})
      });
      continue;
    }
    if (classified.kind === 'workspace') {
      workspaceResolutions += 1;
      continue;
    }
    registryResolutions += 1;
    hosts.set(classified.hostname, (hosts.get(classified.hostname) ?? 0) + 1);
  }

  return {
    ok: findings.length === 0,
    findings,
    registryResolutions,
    workspaceResolutions,
    hosts: Object.fromEntries([...hosts.entries()].sort())
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const filename = path.resolve(options.lockfile);
  let lockfile;
  try {
    lockfile = JSON.parse(await readFile(filename, 'utf8'));
  } catch (error) {
    throw new Error(
      `Unable to read JSON lockfile ${filename}: ` +
      (error instanceof Error ? error.message : String(error))
    );
  }

  const result = {
    schemaVersion: 1,
    lockfile: filename,
    allowedRegistry: `https://${PUBLIC_NPM_HOST}/`,
    ...inspectLockfile(lockfile)
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    console.log('Lockfile portability review');
    console.log(`Allowed registry: ${result.allowedRegistry}`);
    console.log(`Registry resolutions: ${result.registryResolutions}`);
    console.log(`Workspace resolutions: ${result.workspaceResolutions}`);
    for (const finding of result.findings) {
      console.log(
        `BLOCKER: ${finding.code} at ${finding.location}` +
        (finding.hostname ? ` (${finding.hostname})` : '')
      );
    }
    if (result.ok) {
      console.log('PASS: lockfile contains only public npm and workspace resolutions.');
    }
  }

  if (!result.ok) process.exit(1);
}

const isEntrypoint = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exit(1);
  });
}
