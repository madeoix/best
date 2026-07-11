#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  extractVerifiedRelease,
  verifyOuterChecksum
} from './lib/production-release.mjs';

function usage() {
  console.log(`Usage: node scripts/production-doctor.mjs [options]\n\n` +
    `Options:\n` +
    `  --release <archive>   Verified release archive.\n` +
    `  --audit <file>        Read-only production audit JSON.\n` +
    `  --stage <stage>       inventory, foundation, shadow, or database.\n` +
    `  --env-dir <path>      Validate production environment files.\n` +
    `  --json                Emit machine-readable output.\n` +
    `  --help                Show this help.\n\n` +
    `The doctor is read-only and never prints environment values.`);
}

function parseArguments(argv) {
  const result = {
    release: null,
    audit: null,
    stage: 'inventory',
    envDir: null,
    json: false
  };

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
    if (['--release', '--audit', '--stage', '--env-dir'].includes(argument)) {
      const value = argv[index + 1];
      if (!value) throw new Error(`${argument} requires a value`);
      const key = {
        '--release': 'release',
        '--audit': 'audit',
        '--stage': 'stage',
        '--env-dir': 'envDir'
      }[argument];
      result[key] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  if (!result.release) throw new Error('--release is required');
  if (!result.audit) throw new Error('--audit is required');
  if (!['inventory', 'foundation', 'shadow', 'database'].includes(result.stage)) {
    throw new Error('--stage must be inventory, foundation, shadow, or database');
  }
  return result;
}

function runCheck(name, command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024
  });
  return {
    name,
    ok: result.status === 0,
    status: result.status,
    output: [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const archive = path.resolve(options.release);
  const checks = [];
  let commit = null;
  let extracted = null;

  try {
    const digest = await verifyOuterChecksum(archive);
    checks.push({ name: 'outer checksum', ok: true, output: digest });
  } catch (error) {
    checks.push({
      name: 'outer checksum',
      ok: false,
      output: error instanceof Error ? error.message : String(error)
    });
  }

  try {
    extracted = await extractVerifiedRelease(
      archive,
      path.resolve('scripts/verify-production-release.mjs')
    );
    commit = extracted.release.commit;
    checks.push({
      name: 'release archive',
      ok: true,
      output: `commit ${commit}`
    });
  } catch (error) {
    checks.push({
      name: 'release archive',
      ok: false,
      output: error instanceof Error ? error.message : String(error)
    });
  }

  checks.push(runCheck(
    `audit ${options.stage}`,
    process.execPath,
    [
      'scripts/evaluate-production-audit.mjs',
      options.audit,
      '--stage',
      options.stage
    ]
  ));

  if (options.envDir) {
    const args = [
      'scripts/validate-production-env.mjs',
      '--dir',
      options.envDir,
      '--json'
    ];
    if (commit) args.push('--commit', commit);
    checks.push(runCheck('environment files', process.execPath, args));
  } else if (!['inventory', 'database'].includes(options.stage)) {
    checks.push({
      name: 'environment files',
      ok: false,
      output: '--env-dir is required for foundation and shadow readiness'
    });
  }

  const audit = JSON.parse(await readFile(options.audit, 'utf8'));
  if (commit && options.stage !== 'inventory') {
    const current = audit.filesystem?.paths?.['/srv/smallverse/current'];
    if (options.stage === 'shadow' && current?.resolved) {
      const currentRelease = path.basename(current.resolved);
      checks.push({
        name: 'current release',
        ok: currentRelease === commit,
        output: currentRelease === commit
          ? `current resolves to ${commit}`
          : `current resolves to ${current.resolved}; expected ${commit}`
      });
    }
  }

  if (extracted) await extracted.cleanup();

  const blockers = checks.filter((check) => !check.ok);
  const result = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: 'read-only',
    stage: options.stage,
    release: archive,
    commit,
    ok: blockers.length === 0,
    checks
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Beacon production doctor: ${options.stage}`);
    console.log(`Release: ${commit ?? 'unverified'}`);
    for (const check of checks) {
      console.log(`${check.ok ? 'PASS' : 'BLOCKER'} ${check.name}: ${check.output.split('\n')[0]}`);
    }
    console.log(blockers.length === 0
      ? 'READY: this stage has no blockers.'
      : `NOT READY: ${blockers.length} blocker(s) remain.`);
  }

  if (blockers.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
