import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

const environment = {
  ...process.env,
  SMALLVERSE_OPERATOR_API_URL:
    process.env.SMALLVERSE_OPERATOR_API_URL ||
    'http://127.0.0.1:8781',
  SMALLVERSE_OPERATOR_TOKEN:
    process.env.SMALLVERSE_OPERATOR_TOKEN ||
    'smallverse-local-operator-token-change-me',
  VITE_SMALLVERSE_PUBLIC_API_BASE:
    process.env.VITE_SMALLVERSE_PUBLIC_API_BASE ||
    'http://127.0.0.1:8780'
};

function trimTrailingSlash(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

async function requireEndpoint(label, url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4_000);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    const reason =
      error?.name === 'AbortError'
        ? 'request timed out'
        : error?.message || 'connection failed';

    throw new Error(
      `${label} is not ready at ${url} (${reason}). ` +
      'Start it with `npm run dev:runtime` in another terminal.'
    );
  } finally {
    clearTimeout(timeout);
  }
}

const publicBase = trimTrailingSlash(
  environment.VITE_SMALLVERSE_PUBLIC_API_BASE
);
const operatorBase = trimTrailingSlash(
  environment.SMALLVERSE_OPERATOR_API_URL
);

await requireEndpoint(
  'Public API',
  `${publicBase}/api/v1/health`
);

await requireEndpoint(
  'Operator API',
  `${operatorBase}/_service`,
  {
    headers: {
      authorization:
        `Bearer ${environment.SMALLVERSE_OPERATOR_TOKEN}`
    }
  }
);

const binary = path.join(
  root,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'tauri.cmd' : 'tauri'
);

const child = spawn(binary, ['dev'], {
  cwd: root,
  env: environment,
  stdio: 'inherit'
});

child.once('error', (error) => {
  console.error('Could not start the Tauri desktop runtime:', error);
  process.exitCode = 1;
});

child.once('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    if (!child.killed) {
      child.kill(signal);
    }
  });
}
