#!/usr/bin/env node

import process from 'node:process';

function usage() {
  console.log(`Usage: node scripts/smoke-production.mjs [options]\n\n` +
    `Options:\n` +
    `  --public-base <url>    Public API base (default: loopback:8780).\n` +
    `  --with-operator        Also run read-only operator checks.\n` +
    `  --operator-base <url>  Operator API base.\n` +
    `  --with-static          Verify the static SPA root through Nginx.\n` +
    `  --host-header <host>   Send an explicit Host header.\n` +
    `  --help                 Show this help.\n\n` +
    `Operator checks require SMALLVERSE_OPERATOR_TOKEN. No mutation routes ` +
    `are called.\n`);
}

function parseArguments(argv) {
  const result = {
    publicBase:
      process.env.SMALLVERSE_PUBLIC_API_BASE || 'http://127.0.0.1:8780',
    operatorBase:
      process.env.SMALLVERSE_OPERATOR_API_BASE || 'http://127.0.0.1:8781',
    withOperator: false,
    withStatic: false,
    hostHeader: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--help') {
      usage();
      process.exit(0);
    }

    if (argument === '--with-operator') {
      result.withOperator = true;
      continue;
    }

    if (argument === '--with-static') {
      result.withStatic = true;
      continue;
    }

    if (argument === '--public-base' || argument === '--operator-base' || argument === '--host-header') {
      const value = argv[index + 1];
      if (!value) throw new Error(`${argument} requires a URL`);

      if (argument === '--public-base') result.publicBase = value;
      else if (argument === '--operator-base') result.operatorBase = value;
      else result.hostHeader = value;

      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  result.publicBase = result.publicBase.replace(/\/+$/, '');
  result.operatorBase = result.operatorBase.replace(/\/+$/, '');
  return result;
}

async function request(
  base,
  pathname,
  {
    expected = 200,
    headers = {},
    parse = 'json'
  } = {}
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(`${base}${pathname}`, {
      headers: {
        ...(globalThis.SMALLVERSE_SMOKE_HOST_HEADER
          ? { host: globalThis.SMALLVERSE_SMOKE_HOST_HEADER }
          : {}),
        ...headers
      },
      signal: controller.signal
    });
    const body = parse === 'text'
      ? await response.text()
      : await response.json().catch(() => null);

    if (response.status !== expected) {
      throw new Error(
        `${pathname}: expected HTTP ${expected}, received ` +
        `${response.status}\n${JSON.stringify(body, null, 2)}`
      );
    }

    console.log(`PASS ${response.status} ${pathname}`);
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

async function smokePublic(base, withStatic = false) {
  if (withStatic) {
    const html = await request(base, '/', { parse: 'text' });
    if (!/<!doctype html|<html/i.test(html)) {
      throw new Error('Static root did not return the Beacon SPA document.');
    }
  }

  const health = await request(base, '/api/v1/health');
  if (!health?.data?.dependencies) {
    throw new Error('Public health response omitted dependency status.');
  }

  const world = await request(base, '/api/beacon/world');
  const status = await request(base, '/api/beacon/observatory/status');
  const search = await request(
    base,
    '/api/beacon/observatory/search?q=&limit=5'
  );

  if (!status || typeof status !== 'object') {
    throw new Error('Observatory status response was empty.');
  }

  const firstItem = search?.items?.find((item) => item?.source_xml);
  if (!firstItem) {
    throw new Error(
      'The preserved Observatory export returned no searchable items.'
    );
  }

  const source = encodeURIComponent(firstItem.source_xml);
  await request(
    base,
    `/api/beacon/observatory/item?source_xml=${source}`
  );
  await request(
    base,
    `/api/v1/items/profile?source_xml=${source}`
  );

  const firstAvatar = world?.avatars?.find((avatar) => avatar?.avatar_id);
  if (firstAvatar) {
    await request(
      base,
      `/api/v1/avatars/${encodeURIComponent(firstAvatar.avatar_id)}`
    );
  } else {
    console.log('SKIP avatar profile: world export has no avatar records');
  }

  const firstSpace = world?.spaces?.find((space) => space?.space_id);
  if (firstSpace) {
    await request(
      base,
      `/api/v1/spaces/${encodeURIComponent(firstSpace.space_id)}`
    );
  } else {
    console.log('SKIP space profile: world export has no space records');
  }

  await request(base, '/api/v1/spin/prices');
  await request(base, '/ops/v1/health', { expected: 404 });
}

async function smokeOperator(base) {
  const token = process.env.SMALLVERSE_OPERATOR_TOKEN?.trim();
  if (!token) {
    throw new Error(
      'SMALLVERSE_OPERATOR_TOKEN is required with --with-operator'
    );
  }

  await request(base, '/ops/v1/health');
  await request(base, '/ops/v1/overview', {
    headers: {
      authorization: `Bearer ${token}`
    }
  });
}

async function main() {
  const options = parseArguments(process.argv.slice(2));

  globalThis.SMALLVERSE_SMOKE_HOST_HEADER = options.hostHeader;
  console.log(`Public smoke target: ${options.publicBase}`);
  if (options.hostHeader) console.log(`Host header: ${options.hostHeader}`);
  await smokePublic(options.publicBase, options.withStatic);

  if (options.withOperator) {
    console.log(`Operator smoke target: ${options.operatorBase}`);
    await smokeOperator(options.operatorBase);
  } else {
    console.log('SKIP operator checks: --with-operator was not requested');
  }

  console.log('Production read-only smoke test passed.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
