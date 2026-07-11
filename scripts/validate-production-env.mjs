#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import {
  SERVICE_ENVIRONMENTS,
  inspectEnvironmentFile
} from './lib/production-config.mjs';

function usage() {
  console.log(`Usage: node scripts/validate-production-env.mjs [options]\n\n` +
    `Options:\n` +
    `  --dir <path>          Validate all three files in a directory.\n` +
    `  --service <name>      Validate public, operator, or worker.\n` +
    `  --file <path>         Environment file used with --service.\n` +
    `  --commit <sha>        Require SMALLVERSE_VERSION to match a release.\n` +
    `  --skip-metadata       Skip root ownership and mode checks.\n` +
    `  --json                Emit machine-readable output.\n` +
    `  --quiet               Print only failures.\n` +
    `  --help                Show this help.\n\n` +
    `Values and secrets are never printed.`);
}

function parseArguments(argv) {
  const result = {
    directory: null,
    service: null,
    filename: null,
    commit: null,
    skipMetadata: false,
    json: false,
    quiet: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--help') {
      usage();
      process.exit(0);
    }
    if (argument === '--skip-metadata') {
      result.skipMetadata = true;
      continue;
    }
    if (argument === '--json') {
      result.json = true;
      continue;
    }
    if (argument === '--quiet') {
      result.quiet = true;
      continue;
    }
    if (['--dir', '--service', '--file', '--commit'].includes(argument)) {
      const value = argv[index + 1];
      if (!value) throw new Error(`${argument} requires a value`);
      const key = {
        '--dir': 'directory',
        '--service': 'service',
        '--file': 'filename',
        '--commit': 'commit'
      }[argument];
      result[key] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  if (result.directory && (result.service || result.filename)) {
    throw new Error('--dir cannot be combined with --service or --file');
  }
  if (!result.directory && (!result.service || !result.filename)) {
    throw new Error('Use --dir or provide both --service and --file');
  }
  if (result.service && !SERVICE_ENVIRONMENTS[result.service]) {
    throw new Error(`Unknown service: ${result.service}`);
  }
  if (result.commit && !/^[a-f0-9]{7,40}$/.test(result.commit)) {
    throw new Error('--commit must be a lowercase 7-40 character Git SHA');
  }

  return result;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const requests = options.directory
    ? Object.entries(SERVICE_ENVIRONMENTS).map(([service, descriptor]) => ({
        service,
        filename: path.join(options.directory, descriptor.filename)
      }))
    : [{ service: options.service, filename: options.filename }];
  const reports = [];

  for (const request of requests) {
    try {
      reports.push(await inspectEnvironmentFile(
        request.service,
        request.filename,
        {
          expectedCommit: options.commit,
          skipMetadata: options.skipMetadata
        }
      ));
    } catch (error) {
      reports.push({
        service: request.service,
        filename: request.filename,
        keys: [],
        metadata: null,
        findings: [{
          severity: 'blocker',
          code: 'ENV_FILE_UNREADABLE',
          message: error instanceof Error ? error.message : String(error),
          key: null
        }]
      });
    }
  }

  const findings = reports.flatMap((report) => report.findings);
  const blockers = findings.filter((item) => item.severity === 'blocker');
  const warnings = findings.filter((item) => item.severity === 'warning');
  const result = {
    ok: blockers.length === 0,
    files: reports.map((report) => ({
      service: report.service,
      filename: report.filename,
      keys: report.keys,
      metadata: report.metadata,
      findingCount: report.findings.length
    })),
    summary: {
      blockers: blockers.length,
      warnings: warnings.length
    },
    findings
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (!options.quiet || findings.length > 0) {
      console.log('Production environment validation');
      console.log(`Files: ${reports.length}`);
      console.log(`Blockers: ${blockers.length}`);
      console.log(`Warnings: ${warnings.length}`);
      for (const item of findings) {
        console.log(`${item.severity.toUpperCase()} ${item.code}: ${item.message}`);
      }
      if (findings.length === 0) {
        console.log('PASS: environment files are valid; values were not displayed.');
      }
    }
  }

  if (blockers.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
