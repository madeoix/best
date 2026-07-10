import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const sourceRoot = path.join(root, 'src');
const violations = [];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...await walk(absolute));
    } else if (/\.(js|svelte|ts)$/.test(entry.name)) {
      files.push(absolute);
    }
  }

  return files;
}

for (const filename of await walk(sourceRoot)) {
  const relative = path.relative(root, filename);

  if (relative.startsWith(`src${path.sep}routes${path.sep}api${path.sep}`)) {
    continue;
  }

  const text = await readFile(filename, 'utf8');
  const directFetchPattern = /\bfetch\s*\(\s*([`'"])\/api\//g;

  if (directFetchPattern.test(text)) {
    violations.push(
      `${relative}: direct fetch('/api/...') bypasses the runtime API client`
    );
  }

  if (relative.includes(`${path.sep}components${path.sep}`)) {
    for (const [index, line] of text.split('\n').entries()) {
      if (
        /([`'"])\/api\//.test(line) &&
        !line.includes('publicApiUrl(') &&
        !line.includes('operatorApiUrl(')
      ) {
        violations.push(
          `${relative}:${index + 1}: component API path must be wrapped by the runtime client`
        );
      }
    }
  }

  if (
    !relative.endsWith(
      path.join('src', 'lib', 'runtime', 'apiClient.js')
    ) &&
    /VITE_SMALLVERSE_(PUBLIC|OPERATOR)_API_BASE/.test(text)
  ) {
    violations.push(
      `${relative}: API base configuration must remain in apiClient.js`
    );
  }
}


const migratedSvelteEndpoints = [
  'src/routes/api/beacon/world/+server.js',
  'src/routes/api/beacon/observatory/status/+server.js',
  'src/routes/api/beacon/observatory/search/+server.js',
  'src/routes/api/beacon/observatory/item/+server.js',
  'src/routes/api/beacon/item/profile/+server.js',
  'src/routes/api/beacon/item/profiles/+server.js',
  'src/routes/api/beacon/avatar/profile/+server.js',
  'src/routes/api/beacon/avatar/badge/+server.js',
  'src/routes/api/beacon/space/profile/+server.js',
  'src/routes/api/beacon/spin/prices/+server.js'
];

for (const relative of migratedSvelteEndpoints) {
  try {
    await readFile(path.join(root, relative), 'utf8');
    violations.push(
      `${relative}: migrated public endpoints must live only in apps/api`
    );
  } catch {
    // Expected: the static SPA no longer owns this server route.
  }
}

const publicApiFiles = [
  path.join(root, 'apps', 'api', 'src', 'public-app.ts'),
  path.join(
    root,
    'apps',
    'api',
    'src',
    'modules',
    'legacy',
    'data-store.ts'
  ),
  path.join(
    root,
    'apps',
    'api',
    'src',
    'modules',
    'legacy',
    'profile-builders.ts'
  ),
  path.join(
    root,
    'apps',
    'api',
    'src',
    'modules',
    'legacy',
    'public-routes.ts'
  )
];

for (const filename of publicApiFiles) {
  const text = await readFile(filename, 'utf8');

  if (
    /node:child_process|from ['"]child_process['"]|\bexecFile\b|\bspawn\b/.test(text)
  ) {
    violations.push(
      `${path.relative(root, filename)}: public API may not execute processes`
    );
  }

  if (/\bssh\b|ClearAllForwardings/.test(text)) {
    violations.push(
      `${path.relative(root, filename)}: public API may not SSH to preservation hosts`
    );
  }
}

if (violations.length) {
  console.error('Runtime-boundary violations:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log('Runtime boundaries: OK');
