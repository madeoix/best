#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import {
  chmod,
  lstat,
  readFile,
  readdir,
  readlink,
  realpath,
  writeFile
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const FIXED_SERVICES = [
  'smallverse-explorer.service',
  'smallverse-admin.service',
  'smallverse-explorer.timer',
  'smallverse-admin.timer',
  'smallverse-public-api.service',
  'smallverse-operator-api.service',
  'smallverse-worker.service',
  'nginx.service',
  'postgresql.service',
  'tailscaled.service'
];

const FIXED_ACCOUNTS = [
  'smallverse',
  'smallverse-public',
  'smallverse-operator',
  'smallverse-worker',
  'postgres'
];

const FIXED_PATHS = [
  '/',
  '/usr/bin/node',
  '/opt/smallverse',
  '/opt/smallverse/workspace',
  '/opt/smallverse/automation-workspace',
  '/opt/smallverse/probe-lab-connect',
  '/var/www/smallverse',
  '/srv/smallverse',
  '/srv/smallverse/releases',
  '/srv/smallverse/shared',
  '/srv/smallverse/current',
  '/etc/smallverse',
  '/etc/smallverse/public-api.env',
  '/etc/smallverse/operator-api.env',
  '/etc/smallverse/worker.env'
];

function usage() {
  console.log(`Usage: node scripts/production-audit.mjs [options]\n\n` +
    `Options:\n` +
    `  --output <path>       Also write the JSON report to a file.\n` +
    `  --hash-preservation   SHA-256 discovered Observatory databases.\n` +
    `                        This is read-only but can be slow.\n` +
    `  --help                Show this help.\n`);
}

function parseArguments(argv) {
  const result = {
    output: null,
    hashPreservation: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--help') {
      usage();
      process.exit(0);
    }

    if (argument === '--hash-preservation') {
      result.hashPreservation = true;
      continue;
    }

    if (argument === '--output') {
      const value = argv[index + 1];
      if (!value) throw new Error('--output requires a path');
      result.output = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return result;
}

function run(command, args = [], options = {}) {
  const startedAt = Date.now();
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: options.timeout ?? 15_000,
    maxBuffer: options.maxBuffer ?? 8 * 1024 * 1024,
    env: {
      ...process.env,
      LC_ALL: 'C',
      LANG: 'C'
    }
  });

  return {
    command: [command, ...args],
    status: result.status,
    signal: result.signal,
    durationMs: Date.now() - startedAt,
    stdout: String(result.stdout ?? '').trim(),
    stderr: String(result.stderr ?? '').trim(),
    error: result.error
      ? {
          code: result.error.code ?? null,
          message: result.error.message
        }
      : null
  };
}

async function readText(filename) {
  try {
    return await readFile(filename, 'utf8');
  } catch {
    return null;
  }
}

function parseKeyValue(text) {
  const value = {};

  for (const line of String(text ?? '').split('\n')) {
    const separator = line.indexOf('=');
    if (separator <= 0) continue;

    const key = line.slice(0, separator);
    let item = line.slice(separator + 1);

    if (
      (item.startsWith('"') && item.endsWith('"')) ||
      (item.startsWith("'") && item.endsWith("'"))
    ) {
      item = item.slice(1, -1);
    }

    value[key] = item;
  }

  return value;
}

async function inspectPath(filename) {
  try {
    const info = await lstat(filename);
    const statResult = run('stat', [
      '-c',
      '%U:%G',
      filename
    ]);

    let target = null;
    let resolved = null;

    if (info.isSymbolicLink()) {
      target = await readlink(filename).catch(() => null);
      resolved = await realpath(filename).catch(() => null);
    }

    return {
      path: filename,
      exists: true,
      type: info.isSymbolicLink()
        ? 'symlink'
        : info.isDirectory()
          ? 'directory'
          : info.isFile()
            ? 'file'
            : 'other',
      modeOctal: (info.mode & 0o7777).toString(8).padStart(4, '0'),
      uid: info.uid,
      gid: info.gid,
      owner: statResult.status === 0 ? statResult.stdout : null,
      sizeBytes: info.size,
      modifiedAt: info.mtime.toISOString(),
      target,
      resolved
    };
  } catch (error) {
    return {
      path: filename,
      exists: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function inspectCommand(name) {
  const result = run('which', [name]);
  return {
    name,
    available: result.status === 0 && Boolean(result.stdout),
    path: result.status === 0 ? result.stdout.split('\n')[0] : null,
    error: result.status === 0 ? null : (result.stderr || result.error?.message || null)
  };
}

function inspectAccount(name) {
  const result = run('id', [name]);
  return {
    name,
    exists: result.status === 0,
    identity: result.status === 0 ? result.stdout : null,
    error: result.status === 0 ? null : (result.stderr || null)
  };
}

function inspectService(name) {
  const result = run('systemctl', [
    'show',
    name,
    '--property=LoadState,ActiveState,SubState,UnitFileState,FragmentPath',
    '--no-pager'
  ]);

  return {
    name,
    queryStatus: result.status,
    ...parseKeyValue(result.stdout),
    error: result.status === 0 ? null : (result.stderr || result.error?.message || null)
  };
}

async function inspectNginxSites() {
  const directory = '/etc/nginx/sites-enabled';

  try {
    const names = await readdir(directory);
    const sites = [];

    for (const name of names.sort()) {
      const filename = path.join(directory, name);
      const info = await inspectPath(filename);
      sites.push(info);
    }

    return {
      directory,
      available: true,
      sites
    };
  } catch (error) {
    return {
      directory,
      available: false,
      sites: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function discoverPreservationDatabases(hashPreservation) {
  const root = '/opt/smallverse';
  const rootInfo = await inspectPath(root);

  if (!rootInfo.exists) return [];

  const result = run('find', [
    root,
    '-maxdepth',
    '5',
    '-type',
    'f',
    '(',
    '-name',
    'observatory*.sqlite',
    '-o',
    '-name',
    'observatory*.sqlite3',
    '-o',
    '-name',
    'observatory*.db',
    ')',
    '-print'
  ], {
    timeout: 60_000
  });

  if (result.status !== 0) {
    return [{
      discoveryError: result.stderr || result.error?.message || 'find failed'
    }];
  }

  const files = result.stdout
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .sort();
  const records = [];

  for (const filename of files) {
    const info = await inspectPath(filename);
    let sha256 = null;
    let hashError = null;

    if (hashPreservation) {
      const hash = run('sha256sum', [filename], {
        timeout: 30 * 60_000,
        maxBuffer: 1024 * 1024
      });

      if (hash.status === 0) {
        sha256 = hash.stdout.split(/\s+/)[0] ?? null;
      } else {
        hashError = hash.stderr || hash.error?.message || 'sha256sum failed';
      }
    }

    records.push({
      ...info,
      sha256,
      hashError
    });
  }

  return records;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const commandNames = [
    'node',
    'npm',
    'nginx',
    'systemctl',
    'ss',
    'tailscale',
    'psql',
    'pg_isready',
    'sha256sum',
    'tar'
  ];

  const pathRecords = [];
  for (const filename of FIXED_PATHS) {
    pathRecords.push(await inspectPath(filename));
  }

  const osRelease = parseKeyValue(
    await readText('/etc/os-release')
  );
  const nodeVersion = run('node', ['--version']);
  const npmVersion = run('npm', ['--version']);
  const nginxVersion = run('nginx', ['-v']);
  const nginxTest = run('nginx', ['-t']);
  const postgresVersion = run('psql', ['--version']);
  const postgresReady = run('pg_isready', ['-h', '127.0.0.1']);
  const tailscaleIp = run('tailscale', ['ip', '-4']);
  const tailscaleStatus = run('tailscale', ['status', '--json'], {
    timeout: 20_000,
    maxBuffer: 4 * 1024 * 1024
  });
  const listeners = run('ss', ['-ltn']);
  const diskReports = Object.fromEntries(
    ['/', '/opt/smallverse', '/srv', '/var/www'].map((target) => {
      const result = run('df', ['-Pk', target]);
      return [target, {
        status: result.status,
        output: result.status === 0 ? result.stdout : null,
        error: result.status === 0
          ? null
          : (result.stderr || result.error?.message || null)
      }];
    })
  );

  const report = {
    schemaVersion: 1,
    mode: 'read-only',
    generatedAt: new Date().toISOString(),
    hashPreservationRequested: options.hashPreservation,
    host: {
      hostname: os.hostname(),
      platform: process.platform,
      architecture: process.arch,
      kernel: os.release(),
      username: os.userInfo().username,
      uid: typeof process.getuid === 'function' ? process.getuid() : null,
      gid: typeof process.getgid === 'function' ? process.getgid() : null,
      osRelease
    },
    runtime: {
      node: nodeVersion.status === 0 ? nodeVersion.stdout : null,
      npm: npmVersion.status === 0 ? npmVersion.stdout : null
    },
    commands: Object.fromEntries(
      commandNames.map((name) => [name, inspectCommand(name)])
    ),
    accounts: Object.fromEntries(
      FIXED_ACCOUNTS.map((name) => [name, inspectAccount(name)])
    ),
    services: Object.fromEntries(
      FIXED_SERVICES.map((name) => [name, inspectService(name)])
    ),
    network: {
      listeners: listeners.status === 0 ? listeners.stdout.split('\n') : [],
      listenersError: listeners.status === 0
        ? null
        : (listeners.stderr || listeners.error?.message || null),
      tailscaleIpv4: tailscaleIp.status === 0
        ? tailscaleIp.stdout.split('\n').filter(Boolean)
        : [],
      tailscaleError: tailscaleIp.status === 0
        ? null
        : (tailscaleIp.stderr || tailscaleIp.error?.message || null),
      tailscaleStatusJsonAvailable: tailscaleStatus.status === 0,
      tailscaleStatusError: tailscaleStatus.status === 0
        ? null
        : (tailscaleStatus.stderr || tailscaleStatus.error?.message || null)
    },
    nginx: {
      version: nginxVersion.status === 0
        ? (nginxVersion.stderr || nginxVersion.stdout)
        : null,
      configTestStatus: nginxTest.status,
      configTestOutput: [nginxTest.stdout, nginxTest.stderr]
        .filter(Boolean)
        .join('\n'),
      enabledSites: await inspectNginxSites()
    },
    postgres: {
      version: postgresVersion.status === 0 ? postgresVersion.stdout : null,
      ready: postgresReady.status === 0,
      readyStatus: postgresReady.status,
      readyOutput: [postgresReady.stdout, postgresReady.stderr]
        .filter(Boolean)
        .join('\n')
    },
    filesystem: {
      paths: Object.fromEntries(
        pathRecords.map((record) => [record.path, record])
      ),
      diskReports,
      preservationDatabases:
        await discoverPreservationDatabases(options.hashPreservation)
    },
    memory: {
      meminfo: parseKeyValue(
        (await readText('/proc/meminfo'))
          ?.replace(/^([^:\n]+):\s*/gm, '$1=') ?? ''
      )
    },
    safety: {
      commandsExecutedAreReadOnly: true,
      environmentFileContentsRead: false,
      servicesChanged: false,
      packagesChanged: false,
      filesDeleted: false
    }
  };

  const serialized = `${JSON.stringify(report, null, 2)}\n`;

  if (options.output) {
    await writeFile(options.output, serialized, {
      encoding: 'utf8',
      mode: 0o600
    });
    await chmod(options.output, 0o600);
  }

  process.stdout.write(serialized);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
