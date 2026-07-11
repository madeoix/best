#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { chmod, writeFile } from 'node:fs/promises';
import process from 'node:process';

function usage() {
  console.log(`Usage: node scripts/audit-dependencies.mjs [options]\n\n` +
    `Options:\n` +
    `  --output <path>  Write a mode-0600 JSON report.\n` +
    `  --json           Print JSON instead of the concise report.\n` +
    `  --help           Show this help.\n\n` +
    `This command never runs npm audit fix.`);
}

function parseArguments(argv) {
  const result = { output: null, json: false };
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

function runAudit(args) {
  const result = spawnSync('npm', ['audit', '--json', ...args], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024
  });

  if (result.error) throw result.error;
  let report;
  try {
    report = JSON.parse(result.stdout || '{}');
  } catch {
    throw new Error(`npm audit did not return JSON: ${result.stderr || result.stdout}`);
  }
  if (!report.metadata?.vulnerabilities) {
    throw new Error(`npm audit report is incomplete: ${result.stderr || 'missing metadata'}`);
  }
  return report;
}

function normalize(report) {
  const counts = report.metadata.vulnerabilities;
  const vulnerabilities = Object.entries(report.vulnerabilities ?? {})
    .map(([name, item]) => ({
      name,
      severity: item.severity,
      direct: item.isDirect === true,
      fixAvailable: Boolean(item.fixAvailable)
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  return { counts, vulnerabilities };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const production = normalize(runAudit(['--omit=dev']));
  const complete = normalize(runAudit([]));
  const blockers = [];
  const warnings = [];

  if (production.counts.total > 0) {
    blockers.push(
      `Production dependency tree contains ${production.counts.total} known vulnerability finding(s).`
    );
  }
  if ((complete.counts.high ?? 0) > 0 || (complete.counts.critical ?? 0) > 0) {
    blockers.push('The complete dependency tree contains high or critical findings.');
  }
  if ((complete.counts.low ?? 0) > 0 || (complete.counts.moderate ?? 0) > 0) {
    warnings.push(
      `Development dependency tree contains ${complete.counts.low ?? 0} low and ` +
      `${complete.counts.moderate ?? 0} moderate finding(s).`
    );
  }

  const result = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    policy: {
      productionFindingsAllowed: 0,
      completeHighOrCriticalAllowed: 0,
      automaticFixes: false
    },
    production,
    complete,
    blockers,
    warnings,
    ok: blockers.length === 0
  };
  const serialized = `${JSON.stringify(result, null, 2)}\n`;

  if (options.output) {
    await writeFile(options.output, serialized, { mode: 0o600 });
    await chmod(options.output, 0o600);
  }

  if (options.json) {
    process.stdout.write(serialized);
  } else {
    console.log('Dependency security review');
    console.log(`Production findings: ${production.counts.total}`);
    console.log(`Complete findings: ${complete.counts.total}`);
    for (const message of blockers) console.log(`BLOCKER: ${message}`);
    for (const message of warnings) console.log(`WARNING: ${message}`);
    if (blockers.length === 0) {
      console.log('PASS: no production findings and no high/critical findings.');
    }
  }

  if (blockers.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
