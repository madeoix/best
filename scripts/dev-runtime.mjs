import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const includeWeb = process.argv.includes('--web');
const webPort = process.env.SMALLVERSE_WEB_PORT || '5173';
const localData = path.join(root, '.local-data');
const binary = (name) =>
  path.join(
    root,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? `${name}.cmd` : name
  );

const sharedEnvironment = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV || 'development',
  SMALLVERSE_VERSION:
    process.env.SMALLVERSE_VERSION || 'local-development',
  SMALLVERSE_WORKSPACE:
    process.env.SMALLVERSE_WORKSPACE ||
    path.join(localData, 'workspace'),
  SMALLVERSE_AUTOMATION_ROOT:
    process.env.SMALLVERSE_AUTOMATION_ROOT ||
    path.join(localData, 'automation'),
  SMALLVERSE_PUBLIC_DIR:
    process.env.SMALLVERSE_PUBLIC_DIR ||
    path.join(root, 'static'),
  SMALLVERSE_PUBLIC_ALLOWED_ORIGINS:
    process.env.SMALLVERSE_PUBLIC_ALLOWED_ORIGINS ||
    `http://127.0.0.1:${webPort},http://localhost:${webPort}`,
  SMALLVERSE_PUBLIC_HOST:
    process.env.SMALLVERSE_PUBLIC_HOST || '127.0.0.1',
  SMALLVERSE_PUBLIC_PORT:
    process.env.SMALLVERSE_PUBLIC_PORT || '8780',
  SMALLVERSE_OPERATOR_HOST:
    process.env.SMALLVERSE_OPERATOR_HOST || '127.0.0.1',
  SMALLVERSE_OPERATOR_PORT:
    process.env.SMALLVERSE_OPERATOR_PORT || '8781',
  SMALLVERSE_OPERATOR_TOKEN:
    process.env.SMALLVERSE_OPERATOR_TOKEN ||
    'smallverse-local-operator-token-change-me',
  DATABASE_URL:
    process.env.DATABASE_URL ||
    'postgresql://smallverse:smallverse-development-only@127.0.0.1:5432/smallverse',
  VITE_SMALLVERSE_PUBLIC_API_BASE:
    process.env.VITE_SMALLVERSE_PUBLIC_API_BASE ||
    'http://127.0.0.1:8780'
};


function assertPortAvailable(host, port, label) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();

    server.once('error', (error) => {
      if (error?.code === 'EADDRINUSE') {
        reject(
          new Error(
            `${label} cannot start because ${host}:${port} is already in use. ` +
            'Stop the previous Smallverse runtime before starting another one.'
          )
        );
        return;
      }

      reject(error);
    });

    server.listen(
      {
        host,
        port: Number(port),
        exclusive: true
      },
      () => server.close(resolve)
    );
  });
}

const commands = [
  {
    name: 'public-api',
    command: binary('tsx'),
    args: ['watch', 'apps/api/src/entrypoints/public.ts']
  },
  {
    name: 'operator-api',
    command: binary('tsx'),
    args: ['watch', 'apps/api/src/entrypoints/operator.ts']
  },
  {
    name: 'worker',
    command: binary('tsx'),
    args: ['watch', 'apps/api/src/entrypoints/worker.ts']
  }
];

if (includeWeb) {
  commands.push({
    name: 'web',
    command: binary('vite'),
    args: [
      'dev',
      '--host',
      '127.0.0.1',
      '--port',
      webPort,
      '--strictPort'
    ]
  });
}


const requiredPorts = [
  [
    sharedEnvironment.SMALLVERSE_PUBLIC_HOST,
    sharedEnvironment.SMALLVERSE_PUBLIC_PORT,
    'Public API'
  ],
  [
    sharedEnvironment.SMALLVERSE_OPERATOR_HOST,
    sharedEnvironment.SMALLVERSE_OPERATOR_PORT,
    'Operator API'
  ]
];

if (includeWeb) {
  requiredPorts.push(['127.0.0.1', webPort, 'Web development server']);
}

try {
  for (const [host, port, label] of requiredPorts) {
    await assertPortAvailable(host, port, label);
  }
} catch (error) {
  console.error(error?.message || error);
  process.exit(1);
}

const children = new Map();
let stopping = false;

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;

  for (const child of children.values()) {
    child.kill('SIGTERM');
  }

  const force = setTimeout(() => {
    for (const child of children.values()) {
      if (!child.killed) child.kill('SIGKILL');
    }
  }, 5_000);
  force.unref();

  setTimeout(() => process.exit(exitCode), 100).unref();
}

for (const spec of commands) {
  const child = spawn(spec.command, spec.args, {
    cwd: root,
    env: sharedEnvironment,
    stdio: 'inherit'
  });

  children.set(spec.name, child);

  child.once('error', (error) => {
    console.error(`[${spec.name}] failed to start:`, error);
    stop(1);
  });

  child.once('exit', (code, signal) => {
    children.delete(spec.name);

    if (stopping) return;

    console.error(
      `[${spec.name}] exited unexpectedly ` +
      `(code=${code ?? 'none'}, signal=${signal ?? 'none'})`
    );
    stop(code && code > 0 ? code : 1);
  });
}

console.log([
  'Smallverse local runtime started.',
  `  public API:   http://${sharedEnvironment.SMALLVERSE_PUBLIC_HOST}:${sharedEnvironment.SMALLVERSE_PUBLIC_PORT}`,
  `  operator API: http://${sharedEnvironment.SMALLVERSE_OPERATOR_HOST}:${sharedEnvironment.SMALLVERSE_OPERATOR_PORT}`,
  `  data root:    ${localData}`,
  includeWeb ? `  web:          http://127.0.0.1:${webPort}` : null,
  '',
  'Press Ctrl+C to stop every process.'
].filter(Boolean).join('\n'));

process.once('SIGINT', () => stop(0));
process.once('SIGTERM', () => stop(0));
