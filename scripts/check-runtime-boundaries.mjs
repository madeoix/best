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


const remainingSvelteEndpoints = [];

async function collectSvelteEndpoints(directory) {
  try {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        await collectSvelteEndpoints(absolute);
      } else if (entry.name === '+server.js') {
        remainingSvelteEndpoints.push(path.relative(root, absolute));
      }
    }
  } catch {
    // The static frontend may not have an API directory at all.
  }
}

await collectSvelteEndpoints(path.join(root, 'src', 'routes', 'api'));

for (const relative of remainingSvelteEndpoints) {
  violations.push(
    `${relative}: the static SPA may not own server endpoints`
  );
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


for (const filename of await walk(sourceRoot)) {
  const relative = path.relative(root, filename);
  const text = await readFile(filename, 'utf8');

  if (
    /node:child_process|from ['"]child_process['"]|\bexecFile\b|\bspawn\b/.test(text)
  ) {
    violations.push(
      `${relative}: static frontend source may not execute processes`
    );
  }

  if (
    relative !== path.join('src', 'lib', 'runtime', 'desktopBridge.js') &&
    /__TAURI__|__TAURI_INTERNALS__/.test(text)
  ) {
    violations.push(
      `${relative}: Tauri access must remain behind desktopBridge.js`
    );
  }

  if (
    /VITE_SMALLVERSE_OPERATOR_API_BASE|SMALLVERSE_OPERATOR_TOKEN|operatorRequestJson|operatorApiUrl/.test(text)
  ) {
    violations.push(
      `${relative}: browser code may not connect directly to the operator API`
    );
  }
}

const tauriConfig = JSON.parse(
  await readFile(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf8')
);

if (!tauriConfig.app?.withGlobalTauri) {
  violations.push(
    'src-tauri/tauri.conf.json: withGlobalTauri must be enabled for the isolated desktop bridge'
  );
}

if (!tauriConfig.app?.security?.csp) {
  violations.push(
    'src-tauri/tauri.conf.json: desktop CSP must not be disabled'
  );
}


const tauriCapability = JSON.parse(
  await readFile(
    path.join(root, 'src-tauri', 'capabilities', 'default.json'),
    'utf8'
  )
);
const tauriPermission = await readFile(
  path.join(
    root,
    'src-tauri',
    'permissions',
    'smallverse-desktop.toml'
  ),
  'utf8'
);

if (tauriCapability.remote) {
  violations.push(
    'src-tauri/capabilities/default.json: desktop capabilities may not be granted to remote URLs'
  );
}

if (
  !tauriCapability.permissions?.includes(
    'allow-smallverse-desktop'
  )
) {
  violations.push(
    'src-tauri/capabilities/default.json: the fixed Smallverse desktop permission must be enabled'
  );
}

const requiredDesktopCommands = [
  'desktop_runtime_info',
  'desktop_recent_files',
  'desktop_sessions',
  'desktop_session_action',
  'desktop_operator_action',
  'desktop_operator_overview',
  'desktop_launch_tool'
];

for (const command of requiredDesktopCommands) {
  if (!tauriPermission.includes(`"${command}"`)) {
    violations.push(
      `src-tauri/permissions/smallverse-desktop.toml: missing ${command}`
    );
  }
}

if (/commands\.allow\s*=\s*\[\s*["']\*["']/.test(tauriPermission)) {
  violations.push(
    'src-tauri/permissions/smallverse-desktop.toml: wildcard command permissions are forbidden'
  );
}


const desktopSource = await readFile(
  path.join(root, 'src-tauri', 'src', 'desktop.rs'),
  'utf8'
);
const registeredDesktopCommands = [
  ...desktopSource.matchAll(
    /#\[tauri::command\]\s*pub\s+(?:async\s+)?fn\s+([a-z0-9_]+)/g
  )
].map((match) => match[1]).sort();

if (
  JSON.stringify(registeredDesktopCommands) !==
  JSON.stringify([...requiredDesktopCommands].sort())
) {
  violations.push(
    'src-tauri/src/desktop.rs: exported Tauri commands must exactly match the fixed desktop command set'
  );
}

if (
  /Command::new\(\s*(?:&\s*)?(?:tool|action|command)\b/.test(
    desktopSource
  )
) {
  violations.push(
    'src-tauri/src/desktop.rs: frontend-controlled values may not become executable names'
  );
}

if (
  /pub\s+(?:async\s+)?fn\s+desktop_[^(]+\([^)]*\b(?:path|command|args)\s*:/s.test(
    desktopSource
  )
) {
  violations.push(
    'src-tauri/src/desktop.rs: exported commands may not accept arbitrary paths, commands, or argument arrays'
  );
}

const operatorUnit = await readFile(
  path.join(
    root,
    'infra',
    'systemd',
    'smallverse-operator-api.service'
  ),
  'utf8'
);

if (!/NoNewPrivileges=false/.test(operatorUnit)) {
  violations.push(
    'infra/systemd/smallverse-operator-api.service: narrow sudo actions require NoNewPrivileges=false'
  );
}

if (violations.length) {
  console.error('Runtime-boundary violations:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log('Runtime boundaries: OK');
